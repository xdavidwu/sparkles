<script setup lang="ts">
import {
  VAutocomplete,
  VBtn,
  VCol,
  VRow,
  VSelect,
  VTable,
  VTab,
  VTabs,
  VWindow,
  VWindowItem,
} from 'vuetify/components';
import YAMLViewer from '@/components/YAMLViewer.vue';
import { computed } from 'vue';
import { useNamespaces } from '@/stores/namespaces';
import { storeToRefs } from 'pinia';

const { namespaces } = storeToRefs(useNamespaces());
const namespaceOptions = computed(() => [ '(all)', ...namespaces.value ]);
</script>

<template>
  <VTabs v-model="tab">
    <VTab value="explore">Explore</VTab>
    <VTab v-for="obj in inspectedObjects"
      :key="uniqueKeyForInspectedObject(obj)"
      :value="uniqueKeyForInspectedObject(obj)">
      <template v-if="obj.metadata.namespace">
        {{ obj.metadata.namespace }}/{{ obj.metadata.name }}
      </template>
      <template v-else>
        {{ obj.metadata.name }}
      </template>
    </VTab>
  </VTabs>
  <VWindow v-model="tab">
    <VWindowItem value="explore">
      <VRow>
        <VCol>
          <VAutocomplete label="API group" v-model="targetAPI" :items="apis"
            return-object
            :item-title="(api) => (api.preferredVersion!.groupVersion)" />
        </VCol>
        <VCol>
          <VAutocomplete label="Kind" v-model="targetResource" :items="resources"
            return-object item-title="name" />
        </VCol>
        <VCol>
          <VAutocomplete v-if="targetResource.namespaced" label="Namespace"
            v-model="targetNamespace" :items="namespaceOptions" />
          <VSelect v-else label="Namespace" model-value="(global)" disabled />
        </VCol>
      </VRow>
      <VTable hover>
        <thead>
          <tr>
            <th v-for="column in listing.columnDefinitions" :key="column.name"
              :title="column.description">{{ column.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in listing.rows"
            :key="uniqueKeyForTable(row.object as V1PartialObjectMetadata)"
            @click="inspectObject(row.object as V1PartialObjectMetadata)"
            style="cursor: pointer">
            <td v-for="cell in row.cells" :key="String(cell)">{{ cell }}</td>
          </tr>
        </tbody>
      </VTable>
    </VWindowItem>
    <VWindowItem v-for="(obj, idx) in inspectedObjects"
      :key="uniqueKeyForInspectedObject(obj)"
      :value="uniqueKeyForInspectedObject(obj)">
      <YAMLViewer :data="obj" />
      <VBtn @click="closeTab(idx)">Close</VBtn>
    </VWindowItem>
  </VWindow>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import {
  ApisApi,
  CoreApi,
  type V1APIGroup,
  type V1APIResource,
} from '@/kubernetes-api/src';
import { AnyApi, type V1Table, type V1PartialObjectMetadata } from '@/utils/AnyApi';

interface Data {
  apis: Array<V1APIGroup>;
  targetAPI: V1APIGroup;
  resources: Array<V1APIResource>;
  targetResource: V1APIResource;
  targetNamespace: string;
  listing: V1Table;
  tab: string;
  inspectedObjects: Array<any>;
}

const apiConfig = await useApiConfig().getConfig();
const anyApi = new AnyApi(apiConfig);
const apisApi = new ApisApi(apiConfig);
const coreApi = new CoreApi(apiConfig);
const NS_ALL_NAMESPACES = '(all)';

export default defineComponent({
  async created() {
    this.$watch('targetAPI', this.getResources);
    this.$watch('targetResource', this.listResources);
    this.$watch('targetNamespace', this.listResources);
    await this.getAPIs();
  },
  data(): Data {
    return {
      apis: [],
      targetAPI: { name: '', versions: [], preferredVersion: { groupVersion: '(loading)', version: '' } },
      resources: [],
      targetResource: { kind: '(loading)', name: '(loading)', namespaced: false, singularName: '(loading)', verbs: [] },
      targetNamespace: NS_ALL_NAMESPACES,
      listing: {
        columnDefinitions: [],
        rows: [],
      },
      tab: 'explore',
      inspectedObjects: [],
    };
  },
  methods: {
    uniqueKeyForTable(obj: V1PartialObjectMetadata) {
      if (obj.metadata!.uid) {
        return obj.metadata!.uid;
      }
      if (obj.metadata!.namespace) {
        return `${obj.metadata!.namespace}/${obj.metadata!.name}`;
      }
      return obj.metadata!.name;
    },
    uniqueKeyForInspectedObject(obj: any) {
      if (obj.metadata.uid) {
        return obj.metadata.uid;
      }
      if (obj.metadata.namespace) {
        return `${obj.apiVersion}/${obj.kind}/${obj.metadata.namespace}/${obj.metadata.name}`;
      }
      return `${obj.apiVersion}/${obj.kind}/${obj.metadata.name}`;
    },
    async getAPIs() {
      const core = await coreApi.getAPIVersions({});
      const response = await apisApi.getAPIVersions({});
      this.apis =  [
        {
          name: '',
          versions: core.versions.map((i) => ({
            groupVersion: `core/${i}`,
            version: i,
          })),
          preferredVersion: {
            groupVersion: `core/${core.versions[core.versions.length - 1]}`,
            version: core.versions[core.versions.length - 1],
          }
        },
        ...this.apis.concat(response.groups)
      ];
      this.targetAPI = this.apis[0];
    },
    async getResources() {
      const response = await anyApi.getAPIResources({
        group: this.targetAPI.name,
        version: this.targetAPI.preferredVersion!.version,
      });

      // filter out subresources, unlistables
      this.resources = response.resources.filter(
        (v) => (!v.name.includes('/') && v.verbs.includes('list'))
      );
      this.targetResource = this.resources[0];
    },
    async listResources() {
      if (this.targetResource.namespaced && this.targetNamespace !== NS_ALL_NAMESPACES) {
        this.listing = await anyApi.listNamespacedCustomObjectAsTable({
          group: this.targetAPI.name,
          version: this.targetAPI.preferredVersion!.version,
          plural: this.targetResource.name,
          namespace: this.targetNamespace,
        });
      } else {
        this.listing = await anyApi.listClusterCustomObjectAsTable({
          group: this.targetAPI.name,
          version: this.targetAPI.preferredVersion!.version,
          plural: this.targetResource.name,
        });
      }
    },
    async inspectObject(obj: V1PartialObjectMetadata) {
      let object;
      if (obj.metadata!.namespace) {
        object = await anyApi.getNamespacedCustomObject({
          group: this.targetAPI.name,
          version: this.targetAPI.preferredVersion!.version,
          plural: this.targetResource.name,
          namespace: obj.metadata!.namespace!,
          name: obj.metadata!.name!,
        });
      } else {
        object = await anyApi.getClusterCustomObject({
          group: this.targetAPI.name,
          version: this.targetAPI.preferredVersion!.version,
          plural: this.targetResource.name,
          name: obj.metadata!.name!,
        });
      }

      this.inspectedObjects.push(object);
      this.tab = this.uniqueKeyForInspectedObject(object);
    },
    closeTab(idx: number) {
      this.tab = 'explore';
      this.inspectedObjects.splice(idx, 1);
    },
  },
});
</script>
