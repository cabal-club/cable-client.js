// SPDX-FileCopyrightText: 2023 the cabal-club authors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const EventEmitter = require("events").EventEmitter
const debug = require("debug")("pending")

const WAITING = 0
const READY = 1

class Pender extends EventEmitter {
  constructor() {
    super()
    this.pending = 0
    this.state = WAITING
    this.queue = []
  }

  enqueue(cb) {
    switch (this.state) {
      case WAITING:
        this.queue.push(cb)
        break
      case READY:
        cb()
        break
    }
  }

  _done() {
    debug("pender is done, emitting ready")
    this.queue.forEach(cb => cb())
    this.state = READY
    this.emit("ready")
  }

  wait(msg) {
    ++this.pending
    if (msg) {
      debug("wait (%d) %s", this.pending, msg)
    } else {
      debug("wait (%d)", this.pending)
    }
    return () => {
      this.proceed(msg)
    }
  }

  proceed(msg) {
    --this.pending
    if (msg) {
      debug("proceed (%d) %s", this.pending, msg)
    } else {
      debug("proceed (%d)", this.pending)
    }
    if (this.pending <= 0) {
      this._done()
    }
  }
}

module.exports = Pender
