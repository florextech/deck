module.exports = {
  name: 'clock',
  version: '1.0.0',
  setup(deck) {
    deck.registerWidget('clock', {
      interval: 1000,
      getData: () => ({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        date: new Date().toLocaleDateString(),
      }),
    });
  }
};
