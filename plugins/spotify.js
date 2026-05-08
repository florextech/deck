/**
 * Spotify Plugin (example)
 * 
 * Shows how to integrate with external APIs.
 * To use for real, add your Spotify API credentials.
 */
module.exports = {
  name: 'spotify',
  version: '1.0.0',
  setup(deck) {
    // Custom action: play/pause
    deck.registerAction('spotify:toggle', () => {
      // macOS: use osascript to control Spotify
      require('child_process').exec(
        'osascript -e \'tell application "Spotify" to playpause\'',
        (err) => {
          if (err) deck.notify('Spotify not running', 'warning');
          else deck.notify('Spotify toggled', 'success');
        }
      );
    });

    // Custom action: next track
    deck.registerAction('spotify:next', () => {
      require('child_process').exec(
        'osascript -e \'tell application "Spotify" to next track\'',
        () => deck.notify('Next track', 'info')
      );
    });

    // Widget: now playing (updates every 5s)
    deck.registerWidget('spotify', {
      interval: 5000,
      getData: () => {
        try {
          const result = require('child_process').execSync(
            'osascript -e \'tell application "Spotify" to name of current track & " - " & artist of current track\'',
            { encoding: 'utf-8', timeout: 2000 }
          ).trim();
          return { nowPlaying: result || 'Nothing playing' };
        } catch {
          return { nowPlaying: 'Spotify not running' };
        }
      },
    });
  }
};
