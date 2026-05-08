# Plugins

Plugins are JavaScript files that extend Deck functionality.

## Creating a plugin

Create a `.js` file in the `plugins/` directory:

```js
module.exports = {
  name: 'my-plugin',
  version: '1.0.0',

  // Called when plugin loads
  setup(deck) {
    // Register a custom action type
    deck.registerAction('spotify:play', async (payload) => {
      // your logic here
    });

    // Register a widget
    deck.registerWidget('now-playing', {
      interval: 5000, // update every 5s
      getData: async () => ({ title: 'Song name', artist: 'Artist' }),
    });

    // Send notifications
    deck.notify('Plugin loaded!', 'success');
  }
};
```

## Available plugins

Place `.js` files in the `plugins/` folder and restart Deck.

## Plugin API

- `deck.registerAction(type, handler)` — register custom action type
- `deck.registerWidget(id, { interval, getData })` — register live widget
- `deck.notify(title, level)` — send notification to tablet
- `deck.getActions()` — get current actions list
- `deck.onExecute(callback)` — hook into action execution
