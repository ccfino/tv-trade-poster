'use strict';

const { EventEmitter } = require('events');

// Shared event bus used by all modules to emit events to the dashboard.
// Events:
//   ws_connected      { url, id }
//   ws_disconnected   { reason }
//   ws_error          { message }
//   recommendation    { rec }
//   processing_start  { stock }
//   images_generated  { stock, postPath, reelPath }
//   post_success      { stock, postId }
//   post_failed       { stock, error }
//   dry_run           { stock, postPath, reelPath }
//   log               { level, message, time }

const appEvents = new EventEmitter();
appEvents.setMaxListeners(20);

module.exports = appEvents;
