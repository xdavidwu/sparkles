<script lang="ts" setup>
import {
  VBtn,
  VDataTable,
  VIcon,
  VTab,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import AttachTerminal from '@/components/AttachTerminal.vue';
import ExecTerminal from '@/components/ExecTerminal.vue';
import FileManager from '@/components/FileManager.vue';
import HumanDurationSince from '@/components/HumanDurationSince.vue';
import KeyValueBadge from '@/components/KeyValueBadge.vue';
import LogViewer from '@/components/LogViewer.vue';
import LinkedImage from '@/components/LinkedImage.vue';
import TabsWindow from '@/components/TabsWindow.vue';
import TippedBtn from '@/components/TippedBtn.vue';
import WindowItem from '@/components/WindowItem.vue';
import { ref, watch } from 'vue';
import { useApiLoader } from '@/composables/apiLoader';
import { useAppTabs } from '@/composables/appTabs';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import { usePermissions } from '@/stores/permissions';
import { useApiConfig } from '@/stores/apiConfig';
import {
  CoreV1Api,
  type V1Pod, V1PodFromJSON, type V1Container, type V1ContainerStatus, type V1EphemeralContainer,
} from '@xdavidwu/kubernetes-client-typescript-fetch';
import {
  bySSA, mirrorPodAnnotation, restrictedSecurityContext, V1WatchEventType,
} from '@/utils/api';
import { truncateStart } from '@/utils/text';
import { listAndUnwaitedWatch, watchUntil } from '@/utils/watch';
import { notifyListingWatchErrors } from '@/utils/errors';
import { PresentedError } from '@/utils/PresentedError';
import { withProgress } from '@/utils/progressReport';

interface ContainerSpec {
  namespace: string,
  pod: string,
  container: string,
}

enum TabType {
  EXEC,
  LOG,
  ATTACH,
  FILE_MANAGER,
}

interface Tab {
  type: TabType,
  id: string,
  spec: ContainerSpec,
  title?: string,
  defaultTitle: string,
  description: string,
  alerting: boolean,
  previous?: boolean,
  bellTimeoutID?: ReturnType<typeof setTimeout>,
}

type ContainerData = (V1Container | V1EphemeralContainer) & Partial<V1ContainerStatus> & { type?: string };

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces;
const { selectedNamespace } = storeToRefs(namespacesStore);
const permissionsStore = usePermissions();

const api = new CoreV1Api(await useApiConfig().getConfig());

const tab = ref('table');
const tabs = ref<Array<Tab>>([]);
const pods = ref<Array<V1Pod>>([]);
const expanded = ref<Array<string>>([]);

const { appBarHeightPX } = useAppTabs();

const columns = [
  {
    title: 'Name',
    key: 'metadata.name',
    value: (pod: V1Pod) =>
      `${pod.metadata!.name}${
        pod.metadata!.annotations?.[mirrorPodAnnotation] ? ' (static)' : ''}${
        pod.metadata!.deletionTimestamp ? ' (deleting)' : ''}`,
  },
  {
    title: 'Owned by',
    key: 'metadata.ownerReferences',
    value: (pod: V1Pod) =>
      pod.metadata!.ownerReferences?.map((o) => `${o.kind} ${o.name}`).join(', '),
  },
  {
    title: 'IPs',
    key: 'status.podIPs',
    value: (pod: V1Pod) => pod.status?.podIPs?.map((a) => a.ip).join(', '),
  },
  {
    title: 'Node',
    key: 'spec.nodeName',
  },
  {
    title: 'Phase',
    key: 'status.phase',
  },
];

const innerColumns = [
  {
    title: 'Container',
    key: 'name',
    value: (c: ContainerData) => `${c.name}${c.type ? ` (${c.type})` : ''}`,
  },
  {
    title: 'Image',
    key: 'image',
  },
  {
    title: 'State',
    key: `state`,
    value: (c: ContainerData) =>
      c.state?.waiting ? `Waiting: ${c.state.waiting.reason}` :
      c.state?.running ? (c.type?.startsWith('ephemeral') ? 'Running' : `Running: ${c.ready ? 'Ready' : 'Unready'}`) :
      c.state?.terminated ? `Terminated: Status ${c.state.terminated.exitCode}` : 'Unknown',
  },
  {
    title: 'Restarts',
    key: 'restartCount',
  },
  {
    title: 'Actions',
    key: 'actions',
    value: 'name',
    sortable: false,
    nowrap: true,
    width: 0,
    cellProps: {
      class: 'ps-1',
    },
  },
];

const toggleExpandAll = (expand: boolean) => expanded.value = expand ?
  pods.value.map((p) => p.metadata!.name!) : [];

const { load, loading } = useApiLoader(async (signal) => {
  toggleExpandAll(false);
  await permissionsStore.loadReview(selectedNamespace.value);
  await listAndUnwaitedWatch(pods, V1PodFromJSON,
    (opt) => api.listNamespacedPodRaw({ ...opt, namespace: selectedNamespace.value }, { signal }),
    notifyListingWatchErrors,
  );
});

watch(selectedNamespace, load, { immediate: true });

const mergeContainerSpecStatus = (pod: V1Pod): Array<ContainerData> =>
  pod.spec!.containers.map((c) => ({
    ...c,
    ...pod.status?.containerStatuses?.find((s) => s.name == c.name),
  })).concat(pod.spec!.initContainers?.map((c) => ({
    ...c,
    ...pod.status?.initContainerStatuses?.find((s) => s.name == c.name),
    type: c.restartPolicy == 'Always' ? 'sidecar' : 'init',
  })) ?? []).concat(pod.spec!.ephemeralContainers?.map((c) => ({
    ...c,
    ...pod.status?.ephemeralContainerStatuses?.find((s) => s.name == c.name),
    type: c.targetContainerName ? `ephemeral, for ${c.targetContainerName}` : 'ephemeral',
  })) ?? []);

const closeTab = (index: number) => {
  tab.value = 'table';
  tabs.value.splice(index, 1);
};

const titlePrefix = {
  [TabType.LOG]: 'Log',
  [TabType.EXEC]: 'Shell',
  [TabType.ATTACH]: 'Debug',
  [TabType.FILE_MANAGER]: 'FS',
};

const components = {
  [TabType.LOG]: LogViewer,
  [TabType.EXEC]: ExecTerminal,
  [TabType.ATTACH]: AttachTerminal,
  [TabType.FILE_MANAGER]: FileManager,
};

const createTab = (type: TabType, target: string, pod: V1Pod, overrides?: Partial<Tab>) => {
  const podName = pod.metadata!.name!;
  const id = type === TabType.LOG ? `${podName}/${target}/${overrides?.previous}` : crypto.randomUUID();
  if (!tabs.value.some((t) => t.id === id)) {
    const isOnlyContainer = (pod.status?.containerStatuses!.length ?? 0) +
      (pod.status?.initContainerStatuses?.length ?? 0) +
      (pod.status?.ephemeralContainerStatuses?.length ?? 0) === 1;
    const name = isOnlyContainer ? truncateStart(podName, 8) : `${truncateStart(podName, 8)}/${target}`;
    const fullName = `${podName}/${target}`;
    tabs.value.push({
      type, id, spec: { namespace: pod.metadata!.namespace!, pod: podName, container: target }, alerting: false,
      defaultTitle: `${titlePrefix[type]}${overrides?.previous ? '*' : ''}: ${name}`,
      description: `${titlePrefix[type]}: ${fullName}${overrides?.previous ? ' (previous)' : ''}`,
      ...overrides,
    });
  }
  // make sure transition gets right
  requestAnimationFrame(() => tab.value = id);
};

const reducePrivilege = import.meta.env.VITE_DEBUG_PRIVILEGED == 'false';
const createEphemeral = (
  target: ContainerData, pod: V1Pod,
  type: string, spec: Omit<V1EphemeralContainer, 'name'>,
): Promise<string> =>
  withProgress('Setting up ephemeral container', async (progress) => {
    progress('Creating ephemeral container');
    const id = crypto.randomUUID().split('-')[1];
    const name = `spk-${type}-${id}`;
    // fs[ug]id
    let uid = 65535, gid = 65535, fscredKnown = false;

    // assuming they don't switch if not from root
    // XXX: is it safe enough?
    if (target.securityContext?.runAsUser && target.securityContext?.runAsGroup) {
      fscredKnown = true;
      uid = target.securityContext.runAsUser;
      gid = target.securityContext.runAsGroup;
    }

    if (reducePrivilege && !fscredKnown) {
      progress('Finding out uid/gid of running container');

      const inspectName = `spk-uid-${id}`; // keep length the same for ui
      const inspect: V1Pod = {
        apiVersion: 'v1',
        kind: 'Pod',
        spec: {
          containers: [], // for types
          ephemeralContainers: [{
            name: inspectName,
            image: 'ghcr.io/xdavidwu/sparkles/busybox:latest',
            args: ['ash', '-c', 'grep ^[UG]id: /proc/1/status | cut -f 5'],
            targetContainerName: target.name,
            securityContext: {
              ...restrictedSecurityContext,
              runAsUser: uid,
              runAsGroup: gid,
            },
          }],
        },
      };

      await api.patchNamespacedPodEphemeralcontainers({
        namespace: pod.metadata!.namespace!,
        name: pod.metadata!.name!,
        body: inspect,
      }, bySSA);

      await watchUntil(
        (opt) => api.listNamespacedPodRaw({
          namespace: pod.metadata!.namespace!,
          fieldSelector: `metadata.name=${pod.metadata!.name}`,
          ...opt
        }),
        V1PodFromJSON,
        (ev) => {
          if (ev.type === V1WatchEventType.ADDED ||
              ev.type === V1WatchEventType.MODIFIED) {
            return !!ev.object.status?.ephemeralContainerStatuses?.find(
              (s) => s.name === inspectName)?.state?.terminated;
          } else if (ev.type === V1WatchEventType.DELETED) {
            throw new PresentedError('Pod deleted on cluster while waiting');
          }
          return false;
        }
      );

      const log = await api.readNamespacedPodLog({
        namespace: pod.metadata!.namespace!,
        name: pod.metadata!.name!,
        container: inspectName,
      });

      const rows = log.split('\n');
      uid = parseInt(rows[0], 10);
      gid = parseInt(rows[1], 10);
    }

    const update: V1Pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      spec: {
        containers: [], // for types
        ephemeralContainers: [{
          ...spec,
          name,
          targetContainerName: target.name,
          securityContext: reducePrivilege ? {
            ...restrictedSecurityContext,
            runAsUser: uid,
            runAsGroup: gid,
          } : {
            privileged: true,
            capabilities: {
              add: ['SYS_PTRACE'], // for /proc/1/root, left for reference
            },
          },
        }],
      }
    };
    await api.patchNamespacedPodEphemeralcontainers({
      namespace: pod.metadata!.namespace!,
      name: pod.metadata!.name!,
      body: update,
    }, bySSA);

    progress('Waiting for ephemeral container to run');
    // TODO timeout?
    await watchUntil(
      (opt) => api.listNamespacedPodRaw({
        namespace: pod.metadata!.namespace!,
        fieldSelector: `metadata.name=${pod.metadata!.name}`,
        ...opt
      }),
      V1PodFromJSON,
      (ev) => {
        if (ev.type === V1WatchEventType.ADDED ||
            ev.type === V1WatchEventType.MODIFIED) {
          return !!ev.object.status?.ephemeralContainerStatuses?.find(
            (s) => s.name === name)?.state?.running;
        } else if (ev.type === V1WatchEventType.DELETED) {
          throw new PresentedError('Pod deleted on cluster while waiting');
        }
        return false;
      }
    );

    return name;
  });

const debug = async (target: ContainerData, pod: V1Pod) => {
  const name = await createEphemeral(
    target,
    pod,
    'dbg',
    {
      image: 'ghcr.io/xdavidwu/sparkles/busybox:latest',
      args: ['ash', '-c', 'cd /proc/1/root; exec ash'],
      stdin: true,
      stdinOnce: true,
      tty: true,
    },
  );

  createTab(TabType.ATTACH, name, pod, {
    description: `Debug: ${pod.metadata!.name}/${name} (for ${target.name})`,
  });
  // TODO find a way to make sure it terminates or gc
};

const sftp = async (target: ContainerData, pod: V1Pod) => {
  const name = await createEphemeral(
    target,
    pod,
    'fs',
    {
      image: 'ghcr.io/xdavidwu/sparkles/sftp-server:latest',
      command: ['/usr/lib/ssh/sftp-server', '-d', '/proc/1/root', '-e', '-l', 'DEBUG3'],
      stdin: true,
      stdinOnce: true,
    },
  );

  createTab(TabType.FILE_MANAGER, name, pod, {
    description: `FS: ${pod.metadata!.name}/${target.name}`,
  });
  // TODO find a way to make sure it terminates or gc
};

const bell = (index: number) => {
  const bellingTab = tabs.value[index];
  if (bellingTab.bellTimeoutID) {
    clearTimeout(bellingTab.bellTimeoutID);
  }
  bellingTab.alerting = true;
  bellingTab.bellTimeoutID = setTimeout(() => {
    bellingTab.bellTimeoutID = undefined;
    if (tab.value === bellingTab.id) {
      bellingTab.alerting = false;
    }
  }, 1000);
};

const mayAllows = (namespace: string, resource: string, name: string, verb: string) =>
  permissionsStore.mayAllows(namespace, '', resource, name, verb);

const EPERM = 'insufficient permission';

const logDisabledReason = (container: ContainerData, pod: V1Pod) =>
  container.state?.waiting ? 'container waiting to be run' :
  !mayAllows(pod.metadata!.namespace!, 'pods/log', pod.metadata!.name!, 'get') ? EPERM :
  undefined;

const previousLogDisabledReason = (container: ContainerData, pod: V1Pod) =>
  !container.lastState?.terminated ? 'previous instance not found' :
  !mayAllows(pod.metadata!.namespace!, 'pods/log', pod.metadata!.name!, 'get') ? EPERM :
  undefined;

const shellDisabledReason = (container: ContainerData, pod: V1Pod) =>
  !container.state?.running ? 'container not running' :
  !mayAllows(pod.metadata!.namespace!, 'pods/exec', pod.metadata!.name!, 'get') ? EPERM :
  undefined;

const debugDisabledReason = (container: ContainerData, pod: V1Pod) =>
  pod.metadata!.annotations?.[mirrorPodAnnotation] ? 'not supported on static pods' :
  container.type?.startsWith('ephemeral') ? 'not supported on ephemeral containers' :
  !container.state?.running ? 'container not running' :
  !mayAllows(pod.metadata!.namespace!, 'pods/attach', pod.metadata!.name!, 'get') ? EPERM :
  !mayAllows(pod.metadata!.namespace!, 'pods/ephemeralcontainers', pod.metadata!.name!, 'update') ? EPERM :
  undefined;
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="table">Pods</VTab>
    <DynamicTab v-for="(tab, index) in tabs" :key="tab.id" :value="tab.id"
      :title="tab.title ?? tab.defaultTitle" :description="tab.description"
      @click="() => tab.alerting = false" @close="() => closeTab(index)" />
  </AppTabs>
  <TabsWindow v-model="tab">
    <WindowItem value="table" :transition="false">
      <VDataTable :items="pods" :headers="columns" :loading="loading"
        v-model:expanded="expanded"
        item-value="metadata.name" expand-on-click show-expand>
        <template #[`header.metadata.name`]="{ column, getSortIcon }">
          <div class="v-data-table-header__content">
            {{ column.title }}
            <KeyValueBadge k="annotation" v="value" class="ms-1" />
            <KeyValueBadge k="label" v="value" class="ms-1" pill />
            <VIcon v-if="column.sortable" key="icon" class="v-data-table-header__sort-icon" :icon="getSortIcon(column)" />
          </div>
        </template>
        <template #[`header.data-table-expand`]>
          <VBtn
            :icon="`mdi-chevron-double-${expanded.length === pods.length ? 'up' : 'down'}`"
            size="small" variant="text"
            @click="toggleExpandAll(expanded.length !== pods.length)" />
        </template>
        <template #[`item.metadata.name`]="{ item: pod, value }">
          <div class="my-2">
            {{ value }}
            <br />
            <KeyValueBadge v-for="(value, key) in pod.metadata!.annotations"
              class="mr-1 mb-1"
              :key="key" :k="key as string" :v="value" />
            <br v-if="pod.metadata!.annotations" />
            <KeyValueBadge v-for="(value, key) in pod.metadata!.labels"
              class="mr-1 mb-1"
              :key="key" :k="key as string" :v="value" pill />
          </div>
        </template>
        <template #expanded-row="{ columns, item: pod }">
          <tr>
            <td class="inner-table py-3 no-hover" :colspan="columns.length">
              <VDataTable class="bg-transparent"
                :items="mergeContainerSpecStatus(pod)"
                :headers="innerColumns" density="compact">
                <template #[`item.image`]="{ item, value }">
                  <LinkedImage :image="value" :id="item.imageID" />
                </template>
                <template #[`item.restartCount`]="{ item, value }">
                  {{ value }}
                  <template v-if="value && item.lastState?.terminated?.finishedAt">
                    (<HumanDurationSince :since="item.lastState.terminated.finishedAt" ago />)
                  </template>
                </template>
                <template #[`item.actions`]="{ item, value }">
                  <TippedBtn size="small" icon="mdi-file-document"
                    tooltip="Log" variant="text"
                    :disabled-reason="logDisabledReason(item, pod)"
                    @click="createTab(TabType.LOG, value, pod)" />
                  <TippedBtn size="small" icon="mdi-file-document-minus"
                    tooltip="Log of previous instance" variant="text"
                    :disabled-reason="previousLogDisabledReason(item, pod)"
                    @click="createTab(TabType.LOG, value, pod, { previous: true })" />
                  <TippedBtn size="small" icon="mdi-console-line"
                    tooltip="Shell" variant="text"
                    :disabled-reason="shellDisabledReason(item, pod)"
                    @click="createTab(TabType.EXEC, value, pod)" />
                  <TippedBtn
                    size="small" icon="mdi-bug"
                    tooltip="Debug with ephemeral container" variant="text"
                    :disabled-reason="debugDisabledReason(item, pod)"
                    @click="debug(item, pod)" />
                  <TippedBtn
                    size="small" icon="mdi-folder"
                    tooltip="File manager" variant="text"
                    :disabled-reason="debugDisabledReason(item, pod)"
                    @click="sftp(item, pod)" />
                </template>
              </VDataTable>
            </td>
          </tr>
        </template>
      </VDataTable>
    </WindowItem>
    <WindowItem v-for="(tab, index) in tabs" :key="tab.id"
      :value="tab.id">
      <component :is="components[tab.type]" :previous="tab.previous"
        :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`"
        :container-spec="tab.spec"
        @title-changed="(title: string) => tab.title = title"
        @bell="() => bell(index)" />
    </WindowItem>
  </TabsWindow>
</template>

<style scoped>
.inner-table {
  background-color: rgba(var(--v-theme-background), var(--v-medium-emphasis-opacity));
}

.no-hover:after {
  background-color: transparent !important;
}
</style>
