import 'hammerjs';
import Chart from 'chart.js/auto';
import {
  MatrixController,
  MatrixElement
} from 'chartjs-chart-matrix';
import zoomPlugin from 'chartjs-plugin-zoom';

Chart.register(MatrixController, MatrixElement, zoomPlugin);


window.Chart = Chart;