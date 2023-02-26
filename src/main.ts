import '@mdi/font/css/materialdesignicons.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';
import { Chart, Title, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';

import App from './App.vue';
import router from './router';

import 'vuetify/styles';

Chart.register(Title, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);

const app = createApp(App);

app.use(createPinia());
app.use(createVuetify({
  theme: {
    defaultTheme: 'dark',
  },
}));
app.use(router);

app.mount('#app');
