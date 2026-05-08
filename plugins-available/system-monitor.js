const os = require('os');

module.exports = {
  name: 'system-monitor',
  version: '1.0.0',
  setup(deck) {
    // Widget: CPU & RAM usage updated every 3s
    deck.registerWidget('system', {
      interval: 3000,
      getData: () => {
        const cpus = os.cpus();
        const cpuUsage = cpus.reduce((acc, cpu) => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
          return acc + (1 - cpu.times.idle / total) * 100;
        }, 0) / cpus.length;

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const ramUsage = ((totalMem - freeMem) / totalMem) * 100;

        return {
          cpu: Math.round(cpuUsage),
          ram: Math.round(ramUsage),
          uptime: formatUptime(os.uptime()),
          hostname: os.hostname(),
        };
      },
    });

    deck.notify('System monitor active', 'success');
  }
};

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
