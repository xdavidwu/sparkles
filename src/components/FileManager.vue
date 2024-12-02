<script lang="ts" setup>
import { VCard, VDataIterator, VDivider, VListItem, VProgressCircular } from 'vuetify/components';
import { ref, onUnmounted } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { extractUrl } from '@/utils/api';
import { connect } from '@/utils/wsstream';
import { sftpFromWsstream, asPromise, readAsGenerator } from '@/utils/sftp';
import { normalizeAbsPath, modfmt, isExecutable } from '@/utils/posix';
import { formatDateTime } from '@/utils/lang';
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

type Entry = IItem & Partial<DereferenceResult> & { downloadProgress?: number };

const realroot = '/proc/1/root';
const cwd = ref('/');
const entries = ref<Array<Entry>>([]);
const entriesLoading = ref(false);

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
// TODO loop detection
const dereference = async (b: string, p: string): Promise<DereferenceResult> => {
  const [l] = await asPromise(sftp, 'readlink', [`${realroot}${b}/${p}`]);
  const path = normalizeAbsPath(l.startsWith('/') ? l : `${b}/${l}`);
  const [st] = await asPromise(sftp, 'lstat', [`${realroot}${path}`]);
  const maybeDerefernce = (b: string, p: string) => dereference(b, p).catch(() => undefined);
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

const listdir = async (p: string) => {
  cwd.value = p;
  entries.value = [];
  entriesLoading.value = true;
  const [fd] = await asPromise(sftp, 'opendir', [`${realroot}${p}`]);
  let [res] = await asPromise(sftp, 'readdir', [fd]);
  while (res) {
    entries.value.push(...await Promise.all(res.map(async (r) =>
      r.stats.isSymbolicLink?.() ?
        { ...r, ...await dereference(p, r.filename).catch(() => undefined) } : r)));
    [res] = await asPromise(sftp, 'readdir', [fd]);
  }
  entriesLoading.value = false;
  await asPromise(sftp, 'close', [fd]);
};

listdir('/');

const enter = async (e: Entry) => {
  const path = e.realpath ?? normalizeAbsPath(`${cwd.value.length == 1 ? '' : cwd.value}/${e.filename}`);
  const st = (e.stats.isSymbolicLink?.() && e.target) ? e.target : e.stats;
  if (st.isDirectory?.() && !entriesLoading.value) { // until we have proper concurrency control
    await listdir(path);
  } else if (st.isFile?.()) {
    const [fd] = await asPromise(sftp, 'open', [`${realroot}${path}`, 'r', {}]);
    e.downloadProgress = 0;
    // XXX can we stream it?
    const length = st.size ?? 0;
    const blob = new File(
      await Array.fromAsync(readAsGenerator(
        sftp, fd, 0, length, (read) => e.downloadProgress = read / length * 100,
      )),
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
  };
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

onUnmounted(() => sftp.end());
</script>

<template>
  <VCard class="overflow-y-auto" :title="cwd" :loading="entriesLoading">
    <template #text>
      <VDataIterator :items="entries" items-per-page="-1" :sort-by="[{ key: 'filename' }]">
        <template #default="{ items }">
          <div class="overflow-y-auto">
            <template v-for="{ raw: e }, index in items" :key="e.filename">
              <VDivider v-if="index && index != items.length" />
              <VListItem :title="e.filename" :prepend-icon="getIcon(e)" @dblclick="enter(e)">
                <template #title>
                  {{ e.filename }}
                  <span v-if="e.readlink" class="text-medium-emphasis text-caption">
                    → {{ e.readlink }}
                  </span>
                  <VProgressCircular v-if="e.downloadProgress != undefined"
                    class="ms-1" size="18" width="2"
                    :model-value="e.downloadProgress"/>
                </template>
                <template #subtitle>
                  <pre>{{
                    modfmt(e.stats.mode ?? 0) }} {{
                    `${e.stats.uid}`.padStart(8) }} {{ `${e.stats.gid}`.padStart(8) }} {{
                    fromBytes(e.stats.size ?? 0, { mode: 'IEC' }).split(' ')
                      .map((s, i) => i ? s.padStart(3) : s.padStart(8)).join(' ') }} {{
                    formatDateTime(e.stats.mtime).padStart(32)
                  }}</pre>
                </template>
              </VListItem>
            </template>
          </div>
        </template>
      </VDataIterator>
    </template>
  </VCard>
</template>
