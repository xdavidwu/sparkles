import '@mdi/font/css/materialdesignicons.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';
import {
  Chart,
  Title,
  Tooltip,
  Legend,
  Filler,
  LinearScale,
  TimeScale,
  ArcElement,
  LineElement,
  PointElement,
} from 'chart.js';
import 'chartjs-adapter-date-std';

import App from '@/OIDCApp.vue';
import router from '@/router';

import 'vuetify/styles';

Chart.register(
  Title,
  Tooltip,
  Legend,
  Filler,
  LinearScale,
  TimeScale,
  ArcElement,
  PointElement,
  LineElement,
);

Chart.defaults.color = '#fffd';
Chart.defaults.borderColor = '#fff4';
Chart.defaults.backgroundColor = '#fff4';
Chart.defaults.plugins.legend.labels.boxWidth = 8;
Chart.defaults.plugins.legend.labels.boxHeight = 8;
Chart.defaults.plugins.legend.labels.padding = 8;
Chart.defaults.plugins.title.padding = 0;
Chart.defaults.animation = false;
Chart.defaults.resizeDelay = 1000 / 24;

const app = createApp(App);

app.use(createPinia());
app.use(createVuetify({
  theme: {
    defaultTheme: 'dark',
  },
}));
app.use(router);

app.mount('#app');
