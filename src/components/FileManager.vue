<script lang="ts" setup>
import {
  VCard, VMenu, VDialog,
  VCol, VDataIterator, VList, VListItem, VRow, VTable,
  VDivider, VIcon, VProgressCircular,
  VBtn, VCheckboxBtn, VCombobox,
} from 'vuetify/components';
import SpeedDialBtn from '@/components/SpeedDialBtn.vue';
import SpeedDialFab from '@/components/SpeedDialFab.vue';
import {
  computed, ref, watch,
  onErrorCaptured, onMounted, onUnmounted,
  useTemplateRef,
} from 'vue';
import { useElementBounding } from '@vueuse/core';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { useAbortController } from '@/composables/abortController';
import { extractUrl, rawErrorIsAborted } from '@/utils/api';
import { PresentedError } from '@/utils/PresentedError';
import { connect } from '@/utils/wsstream';
import {
  type SftpError, isSftpError,
  sftpFromWsstream, asPromise, readAsStream, writeFromBlob,
} from '@/utils/sftp';
import { normalizeAbsPath, modfmt, isExecutable } from '@/utils/posix';
import { type Passwd, type Group, parsePasswdLine, parseGroupLine } from '@/utils/linux';
import {
  createChunkTransformStream, createLineDelimitedStream, streamToGenerator,
} from '@/utils/lang';
import { formatDateTime } from '@/utils/time';
import { fromBytes } from '@tsmx/human-readable';
import mime from 'mime';
import type { IItem, IStats } from '@xdavidwu/websocket-sftp/lib/fs-api';

const props = defineProps<{
  containerSpec: {
    namespace: string,
    pod: string,
    container: string,
  },
}>();

interface DereferenceResult {
  target?: IStats;
  realpath?: string;
  readlink: string;
};

type Entry = IItem & Partial<DereferenceResult> & {
  lpath: string;
  downloadProgress?: number,
};

const realroot = '/proc/1/root';
const cwd = ref('/');
const entries = ref<Array<Entry>>([]);
const uploading = ref<Map<string, Map<string, number>>>(new Map());
const entriesLoading = ref(false);
const passwd = ref<{ [uid: number]: Passwd }>({});
const group = ref<{ [gid: number]: Group }>({});

const contextMenu = ref(false);
const contextMenuAbout = ref<Entry | undefined>();
const contextMenuAboutEl = ref<HTMLDivElement | undefined>();
const contextMenuAboutPosition = ref({ x: 0, y: 0 });
const container = useTemplateRef('container');
const { x: containerX, y: containerY } = useElementBounding(container);
const { x: aboutX, y: aboutY, update: updateAboutBox } = useElementBounding(contextMenuAboutEl);
// position of contextMenuAboutEl may change without resize or scroll by gradual entries loading
// XXX until there is sth like PositionObserver
watch(entries, () => requestAnimationFrame(updateAboutBox));
const contextMenuPosition = computed(() => ({
  // XXX maybe relativeToContainer in https://github.com/vueuse/vueuse/pull/4455
  x: contextMenuAboutPosition.value.x + aboutX.value - containerX.value,
  y: contextMenuAboutPosition.value.y + aboutY.value - containerY.value,
}));
const changingPermission = ref(false);
const modBits = ref((new Array(12)).fill(false));
const mod = computed(() =>
  modBits.value.reduceRight((a, v) => (a << 1) | (v ? 1 : 0), 0));
const wantedUser = ref<number | string>(0);
const wantedGroup = ref<number | string>(0);

const uploadFilesInput = useTemplateRef('files');

const configStore = useApiConfig();
const api = new CoreV1Api(await configStore.getConfig());
const url = (await extractUrl(api, (api) => api.connectGetNamespacedPodAttach({
  namespace: props.containerSpec.namespace,
  name: props.containerSpec.pod,
  container: props.containerSpec.container,
  stdin: true,
  stdout: true,
  stderr: true,
}))).replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
const token = await configStore.getBearerToken();

const sftp = await sftpFromWsstream(connect(url, token));

// plain stat is broken with /proc/<pid>/root
const dereference = async (b: string, p: string, c: number = 40): Promise<DereferenceResult> => {
  if (c < 0) {
    throw new Error('ELOOP');
  }
  const [l] = await asPromise(sftp, 'readlink', [`${realroot}${b}/${p}`]);
  const path = normalizeAbsPath(l.startsWith('/') ? l : `${b}/${l}`);
  const [st] = await asPromise(sftp, 'lstat', [`${realroot}${path}`]);
  const maybeDerefernce = (b: string, p: string) => dereference(b, p, c - 1).catch(() => undefined);
  if (st?.isSymbolicLink?.()) {
    if (path == '/') { // ?
      return { ...await maybeDerefernce(path, path), readlink: l };
    } else {
      const sep = path.lastIndexOf('/');
      return {
        ...await maybeDerefernce(path.substring(0, sep), path.substring(sep + 1)),
        readlink: l,
      };
    }
  } else {
    return { target: st, realpath: path, readlink: l };
  }
};

const { abort, signal } = useAbortController();

const listdir = async (p: string, signal: AbortSignal) => {
  entriesLoading.value = true;
  try {
    const [fd] = await asPromise(sftp, 'opendir', [`${realroot}${p}`]);
    cwd.value = p;
    entries.value = [];

    const symlinkPromises = [];
    try {
      signal.throwIfAborted();

      let [res] = await asPromise(sftp, 'readdir', [fd]);

      while (res) {
        signal.throwIfAborted();

        for (const r of res) {
          const lpath = normalizeAbsPath(`${p}/${r.filename}`);
          if (r.stats.isSymbolicLink?.()) {
            symlinkPromises.push((async () => {
              const d = await dereference(p, r.filename).catch(() => undefined);
              signal.throwIfAborted();
              entries.value.push({ ...r, ...d, lpath });
            })());
          } else {
            entries.value.push({ ...r, lpath });
          }
        }
        [res] = await asPromise(sftp, 'readdir', [fd]);
      }
      await Promise.all(symlinkPromises);
      signal.throwIfAborted();
    } catch (e) {
      if (!rawErrorIsAborted(e)) {
        throw e;
      }
      await Promise.allSettled(symlinkPromises); // consume rejects
    } finally {
      await asPromise(sftp, 'close', [fd]);
    }
  } finally {
    entriesLoading.value = false;
  }
};

listdir('/', signal.value);

const enter = async (e: Entry) => {
  const path = e.realpath ?? e.lpath;
  const st = (e.stats.isSymbolicLink?.() && e.target) ? e.target : e.stats;
  if (st.isDirectory?.()) {
    abort();
    await listdir(path, signal.value);
  } else if (st.isFile?.()) {
    const [fd] = await asPromise(sftp, 'open', [`${realroot}${path}`, 'r', {}]);
    e.downloadProgress = 0;
    // XXX can we stream it?
    const length = st.size ?? 0;
    const blob = new File(
      await Array.fromAsync(streamToGenerator(readAsStream(
        sftp, fd, 0, length, (read) => e.downloadProgress = read / length * 100,
      ))),
      e.filename,
      { type: mime.getType(e.filename) ?? '' },
    );
    e.downloadProgress = undefined;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
    // let click to be handled first
    setTimeout(() => URL.revokeObjectURL(url), 0);
    // XXX if opened in browser, ctrl+s doesn't work
  };
};

// XXX: EROFS is not obvious: sftp-server seems not to strerror and returns "Failure" (with SSH_FX_FAILURE) instead
const unlink = async (e: Entry) => {
  await asPromise(sftp, 'unlink', [`${realroot}${e.lpath}`]);
  await listdir(cwd.value, signal.value);
};

const iconFromMime = (m: string) =>
  m.startsWith('text/') ? 'mdi-file-document' :
  m.startsWith('image/') ? 'mdi-image' :
  m.startsWith('video/') ? 'mdi-movie' :
  m.startsWith('audio/') ? 'mdi-music-note' :
  m.startsWith('font/') ? 'mdi-format-size' :
  'mdi-file';
// TODO symlink
const getIcon = (i: Entry) =>
  i.stats.isSymbolicLink?.() ? (
    i.target?.isDirectory?.() ? 'mdi-folder-move-outline' :
    i.target?.isFile?.() ? 'mdi-file-move' :
    'mdi-file-question'
  ) :
  i.stats.isDirectory?.() ? 'mdi-folder-outline' :
  i.stats.isFile?.() ? (
    isExecutable(i.stats.mode ?? 0) ? 'mdi-application-cog':
    iconFromMime(mime.getType(i.filename) ?? '')) :
  'mdi-file-question';

const onContextMenu = (e: MouseEvent, i: Entry) => {
  contextMenuAboutEl.value = e.currentTarget as HTMLDivElement;
  const targetRect = (e.target as Element).getBoundingClientRect();
  const wantedRect = contextMenuAboutEl.value.getBoundingClientRect();

  contextMenuAbout.value = i;
  contextMenuAboutPosition.value = {
    x: e.offsetX + targetRect.x - wantedRect.x,
    y: e.offsetY + targetRect.y - wantedRect.y,
  };
  contextMenu.value = true;
};

const editPermission = (i: Entry) => {
  let mod = i.stats.mode!;
  for (const k in modBits.value) {
    modBits.value[k] = (mod & 1) == 1;
    mod >>= 1;
  }
  wantedUser.value = i.stats.uid!;
  wantedGroup.value = i.stats.gid!;
  changingPermission.value = true;
};

const numericId = /^[1-9][0-9]*$/;
const resolveIds = () => [
  typeof wantedUser.value === 'number' ? wantedUser.value : (() => {
    const v = (wantedUser.value as string).trim();
    if (numericId.test(v)) {
      return parseInt(v, 10);
    }
    const entry = Object.values(passwd.value).find((p) => p.name === v);
    if (!entry) {
      throw new PresentedError(`User ${v} does not exist`);
    }
    return entry.uid;
  })(),
  typeof wantedGroup.value === 'number' ? wantedGroup.value : (() => {
    const v = (wantedGroup.value as string).trim();
    if (numericId.test(v)) {
      return parseInt(v, 10);
    }
    const entry = Object.values(group.value).find((p) => p.groupName === v);
    if (!entry) {
      throw new PresentedError(`Group ${v} does not exist`);
    }
    return entry.gid;
  })(),
];

const savePermission = async (i: Entry) => {
  const stDiff: IStats = {};

  const origMod = (i.stats.mode!) & 0o7777;
  if (mod.value != origMod) {
    stDiff.mode = mod.value;
  }
  const [uid, gid] = resolveIds();
  if (uid != i.stats.uid || gid != i.stats.gid) {
    stDiff.uid = uid;
    stDiff.gid = gid;
  }

  if (Object.keys(stDiff).length > 0) {
    await asPromise(sftp, 'setstat', [`${realroot}${i.lpath}`, stDiff]);
    changingPermission.value = false;
    await listdir(cwd.value, signal.value);
  } else {
    changingPermission.value = false;
  }
};

const upload = async (e: Event) => {
  const targetDir = cwd.value;
  const targets = Array.from((e.target as HTMLInputElement).files!);
  await Promise.all(targets.map(async (f) => {
    // wx: WRITE | CREAT | EXCL
    const [fd] = await asPromise(sftp, 'open', [`${realroot}${targetDir}/${f.name}`, 'wx', {}]);
    // TODO handle name conflicts?

    if (!uploading.value.has(targetDir)) {
      uploading.value.set(targetDir, new Map());
    }
    await writeFromBlob(sftp, fd, f, 0,
      (written) => uploading.value.get(targetDir)!.set(f.name, written / f.size * 100));
  }));
  // XXX reload before this may also see open'd entries
  targets.forEach((f) => uploading.value.get(targetDir)!.delete(f.name));
  if (cwd.value == targetDir) {
    await listdir(cwd.value, signal.value);
  }
};

onErrorCaptured((e) => {
  if (isSftpError(e)) {
    for (const key in e) {
      console.log(key, e[key as keyof SftpError]);
    }
    const msg = e.path ?
      `Accessing ${e.path.replace(realroot, '')}: ${e.description}` :
      e.description;
    throw new PresentedError(msg, { cause: e });
  }
  throw e;
});

onMounted(() => Promise.all([
  (async () => {
    const [fd] = await asPromise(sftp, 'open', [`${realroot}/etc/passwd`, 'r', {}]);
    const entries = streamToGenerator(readAsStream(sftp, fd)
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(createLineDelimitedStream())
      .pipeThrough(createChunkTransformStream(parsePasswdLine)));
    for await (const e of entries) {
      if (e) {
        passwd.value[e.uid] = e;
      }
    }
  })().catch((e) => console.log('Cannot read passwd:', e)), // distroless?
  (async () => {
    const [fd] = await asPromise(sftp, 'open', [`${realroot}/etc/group`, 'r', {}]);
    const entries = streamToGenerator(readAsStream(sftp, fd)
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(createLineDelimitedStream())
      .pipeThrough(createChunkTransformStream(parseGroupLine)));
    for await (const e of entries) {
      if (e) {
        group.value[e.gid] = e;
      }
    }
  })().catch((e) => console.log('Cannot read group:', e)), // distroless?
]));

onUnmounted(() => sftp.end());
</script>

<template>
  <VCard class="overflow-y-auto" :title="cwd" :loading="entriesLoading">
    <template #text>
      <VDataIterator :items="entries" items-per-page="-1" :sort-by="[{ key: 'filename' }]">
        <template #default="{ items }">
          <div class="position-relative" ref="container">
            <div v-for="{ raw: e }, index in items" :key="e.filename"
              @contextmenu.prevent="(ev: MouseEvent) => onContextMenu(ev, e)">
              <VDivider v-if="index && index != items.length" />
              <VListItem :active="contextMenu && contextMenuAbout == e"
                @dblclick="enter(e)">
                <template #title>
                  {{ e.filename }}
                  <span v-if="e.readlink" class="text-medium-emphasis text-caption">
                    → {{ e.readlink }}
                  </span>
                </template>
                <template #subtitle>
                  <pre>{{
                    modfmt(e.stats.mode ?? 0) }} {{
                    `${passwd[e.stats.uid!]?.name ?? e.stats.uid}`.padStart(16) }} {{ `${group[e.stats.gid!]?.groupName ?? e.stats.gid}`.padStart(16) }} {{
                    fromBytes(e.stats.size ?? 0, { mode: 'IEC' }).split(' ')
                      .map((s, i) => i ? s.padStart(3) : s.padStart(8)).join(' ') }} {{
                    formatDateTime(e.stats.mtime).padStart(32)
                  }}</pre>
                </template>
                <template #prepend>
                  <VProgressCircular v-if="e.downloadProgress != undefined"
                    class="me-8" size="21" width="2"
                    :model-value="e.downloadProgress" />
                  <VIcon v-else :icon="getIcon(e)" />
                </template>
              </VListItem>
            </div>
            <div v-for="[name, progress] in uploading.get(cwd)" :key="name">
              <VDivider />
              <VListItem :title="name" prepend-icon="mdi-upload">
                <template #subtitle><pre>Uploading...</pre></template>
                <template #prepend>
                  <VProgressCircular class="me-8" size="21" width="2"
                    :model-value="progress" />
                </template>
              </VListItem>
            </div>
            <VMenu v-model="contextMenu"
              :content-props="{ style: `left: ${contextMenuPosition.x}px; top: ${contextMenuPosition.y}px`}"
              location-strategy="static" absolute attach>
              <VList density="compact">
                <VListItem v-if="!contextMenuAbout!.stats.isDirectory?.()"
                  title="Delete" @click="unlink(contextMenuAbout!)" />
                <!-- TODO lsetstat@openssh.com -->
                <VListItem v-if="!contextMenuAbout!.stats.isSymbolicLink?.()"
                  title="Manage permissions" @click="() => editPermission(contextMenuAbout!)" />
              </VList>
            </VMenu>
          </div>
        </template>
      </VDataIterator>
      <SpeedDialFab icon="$plus">
        <input type="file" ref="files" class="d-none" multiple
          @change="upload" />
        <SpeedDialBtn key="1" label="Upload files" icon="mdi-upload"
          @click.stop="uploadFilesInput!.click()" />
        <SpeedDialBtn key="2" label="TODO New directory" icon="mdi-folder-plus-outline" />
      </SpeedDialFab>
      <!-- TODO make the width stabler -->
      <VDialog v-model="changingPermission" width="auto">
        <VCard :title="`Permissions of ${contextMenuAbout!.filename}`">
          <template #text>
            <VRow dense>
              <VCol>
                <!-- XXX id in title messes with input,
                  but keeps the search highlight from vuetify -->
                <VCombobox label="Owner" v-model="wantedUser"
                  :items="Object.values(passwd)" item-value="uid"
                  :item-title="(i) => i.name ? `${i.name} (${i.uid})` : i"
                  :return-object="false" />
                <!-- TODO make use of owner's group? -->
              </VCol>
              <VCol>
                <VCombobox label="Group" v-model="wantedGroup"
                  :items="Object.values(group)" item-value="gid"
                  :item-title="(i) => i.groupName ? `${i.groupName} (${i.gid})` : i"
                  :return-object="false" />
              </VCol>
            </VRow>
            <VTable density="compact" hover>
              <thead>
                <tr>
                  <th></th>
                  <th>Read</th>
                  <th>Write</th>
                  <th>Execute</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Owner</th>
                  <td><VCheckboxBtn v-model="modBits[8]" /></td>
                  <td><VCheckboxBtn v-model="modBits[7]" /></td>
                  <td><VCheckboxBtn v-model="modBits[6]" /></td>
                </tr>
                <tr>
                  <th>Group</th>
                  <td><VCheckboxBtn v-model="modBits[5]" /></td>
                  <td><VCheckboxBtn v-model="modBits[4]" /></td>
                  <td><VCheckboxBtn v-model="modBits[3]" /></td>
                </tr>
                <tr>
                  <th>Others</th>
                  <td><VCheckboxBtn v-model="modBits[2]" /></td>
                  <td><VCheckboxBtn v-model="modBits[1]" /></td>
                  <td><VCheckboxBtn v-model="modBits[0]" /></td>
                </tr>
              </tbody>
            </VTable>
            <VRow class="mt-1" dense>
              <VCol>
                <VCheckboxBtn label="SUID" v-model="modBits[11]" density="compact" />
              </VCol>
              <VCol>
                <VCheckboxBtn label="SGID" v-model="modBits[10]" density="compact" />
              </VCol>
              <VCol>
                <VCheckboxBtn label="Sticky" v-model="modBits[9]" density="compact" />
              </VCol>
            </VRow>
          </template>
          <template #actions>
            <VBtn variant="text" @click="changingPermission = false">Cancel</VBtn>
            <VBtn variant="text" color="primary"
              @click="() => savePermission(contextMenuAbout!)">Save</VBtn>
          </template>
        </VCard>
      </VDialog>
    </template>
  </VCard>
</template>
