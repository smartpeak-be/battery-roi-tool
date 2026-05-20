(function (global) {
  const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
  const CHART_JS_INTEGRITY = 'sha384-vsrfeLOOY6KuIYKDlmVH5UiBmgIdB1oEf7p01YgWHuqmOHfZr374+odEv96n9tNC';

  let chartJsPromise = null;

  function loadChartJs() {
    if (typeof global.Chart !== 'undefined') return Promise.resolve();
    if (chartJsPromise) return chartJsPromise;

    chartJsPromise = new Promise((resolve, reject) => {
      const script = global.document.createElement('script');
      script.src = CHART_JS_URL;
      script.integrity = CHART_JS_INTEGRITY;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Chart.js kon niet laden'));
      global.document.head.appendChild(script);
    });

    return chartJsPromise;
  }

  global.SmartPeakChartLoader = { loadChartJs };
})(window);
