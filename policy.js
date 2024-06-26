// SPDX-FileCopyrightText: 2023 the cable-client authors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

class ReplicationPolicy {
  constructor() {
    this.limit = 0 /* # of posts */
    this.windowSize = 0 /* ms */
  }
}

class JoinedPolicy extends ReplicationPolicy {
  constructor(opts) {
    super()
    if (!opts) { opts = {} }
    this.limit = opts.limit || 0 /* # of posts */ // no limit
    this.windowSize = opts.windowSize || 2 * 10 * 7 * 24 * 60 * 60 * 1000  /* 2 * 10 weeks in ms */
  }
}

class UnjoinedPolicy extends ReplicationPolicy {
  constructor(opts) {
    super()
    if (!opts) { opts = {} }
    this.limit = opts.limit || 1000 /* # of posts */
    this.windowSize = opts.windowSize || 2 * 10 * 7 * 24 * 60 * 60 * 1000  /* 2 * 10 weeks in ms */
  }
}

class DroppedPolicy extends ReplicationPolicy {
  constructor(opts) {
    super()
    if (!opts) { opts = {} }
    this.limit = opts.limit || 0 /* # of posts */
    this.windowSize = opts.windowSize || 0  /* 0 weeks in ms */
  }
}

module.exports = {
  JoinedPolicy,
  UnjoinedPolicy,
  DroppedPolicy
}
