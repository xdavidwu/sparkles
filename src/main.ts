import '@mdi/font/css/materialdesignicons.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';

import App from './App.vue';
import colors from 'vuetify/lib/util/colors';
import router from './router';

import './assets/main.css'

const app = createApp(App);

app.use(createPinia());
app.use(createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        overlayMultiplier: 1,
      },
    },
  },
}));
app.use(router);

app.mount('#app');
