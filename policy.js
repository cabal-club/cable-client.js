class ReplicationPolicy {
  constructor() {
    this.limit = 0 /* # of posts */
    this.timeWindow = 0 /* ms */
  }
}

class JoinedPolicy extends ReplicationPolicy {
  constructor(opts) {
    super()
    if (!opts) { opts = {} }
    this.limit = opts.limit || 0 /* # of posts */ // no limit
    this.timeWindow = opts.timeWindow || 2 * 7 * 24 * 60 * 60 * 1000  /* 2 weeks in ms */
  }
}

class UnjoinedPolicy extends ReplicationPolicy {
  constructor(opts) {
    super()
    if (!opts) { opts = {} }
    this.limit = opts.limit || 1000 /* # of posts */
    this.timeWindow = opts.timeWindow || 2 * 7 * 24 * 60 * 60 * 1000  /* 2 weeks in ms */
  }
}

class DroppedPolicy extends ReplicationPolicy {
  constructor(opts) {
    super()
    if (!opts) { opts = {} }
    this.limit = opts.limit || 0 /* # of posts */
    this.timeWindow = opts.timeWindow || 0  /* 0 weeks in ms */
  }
}

module.exports = {
  JoinedPolicy,
  UnjoinedPolicy,
  DroppedPolicy
}
