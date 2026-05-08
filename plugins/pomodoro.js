module.exports = {
  name: 'pomodoro',
  version: '1.0.0',
  setup(deck) {
    let timer = null;
    let remaining = 0;

    // Widget: shows remaining time
    deck.registerWidget('pomodoro', {
      interval: 1000,
      getData: () => {
        if (!timer) return { status: 'idle', time: '25:00' };
        const min = Math.floor(remaining / 60);
        const sec = remaining % 60;
        return { status: 'running', time: `${min}:${sec.toString().padStart(2, '0')}` };
      },
    });

    // Action: start/stop pomodoro
    deck.registerAction('pomodoro:toggle', () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
        remaining = 0;
        deck.notify('Pomodoro cancelled', 'warning');
      } else {
        remaining = 25 * 60;
        deck.notify('Pomodoro started! 25 min', 'success');
        timer = setInterval(() => {
          remaining--;
          if (remaining <= 0) {
            clearInterval(timer);
            timer = null;
            deck.notify('⏰ Pomodoro done! Take a break.', 'success');
            // Play system notification sound on macOS
            try { require('child_process').exec('afplay /System/Library/Sounds/Glass.aiff'); } catch {}
          }
        }, 1000);
      }
    });

    deck.notify('Pomodoro plugin ready', 'info');
  }
};
