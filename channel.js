// SPDX-FileCopyrightText: 2023 the cabal-club authors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const timestamp = require('monotonic-timestamp')
const { stableSort, merge } = require('./util')
const postTypes = require("./types.js")
const debug = require("debug")(`cable-client:channel.js`)
const startDebug = (name) => { return require("debug")(`cable-client:${name}`) }

class ChannelDetailsBase {
  constructor (channelName) {
    this.name = channelName

    this.members = new Set()
    this.mentions = []
    this.virtualMessages = []
    this.newMessageCount = 0
    this.datesSeen = new Set()
    this.lastRead = 0 /* timestamp in epoch time */
    this.joined = false
    this.focused = false
    this.topic = ''
  }

  getInfo () {
    const info = new Map()
    info.set("name", this.name)
    info.set("topic", this.topic)
    info.set("joined", this.joined)
    info.set("members", new Set(this.members))
    info.set("mentions", this.mentions.slice())
    return info
  }

  toString () { return this.name }
  addMember (key) { this.members.add(key) }
  removeMember (key) { this.members.delete(key) }
  getMembers () { return Array.from(this.members) }

  addMention (mention) {
    if (!this.focused) {
      this.mentions.push(mention)
    }
  }

	// returns copy
  getMentions () { return this.mentions.slice() }

  handleMessage (message) {
    if (!this.focused) {
      // ++var is an optimization:
      // var++ creates a temporary variable while ++var doesn't
      ++this.newMessageCount
    }
  }

  getNewMessageCount () { return this.newMessageCount }

  markAsRead () {
    this.lastRead = Date.now()
    this.newMessageCount = 0
    this.mentions = []
  }

  markAsUnread () {
    this.lastRead = Date.now()
    this.newMessageCount = 1
  }

  focus () { this.focused = true }
  unfocus () { this.focused = false }
  clearVirtualMessages () { this.virtualMessages = [] }

  /*
   the message format clients operate on consists of the most minimal alteration to the cable.js produced json: 
	 + add key "postHash"
	 + introduce virtual postType value of "postType" = -1, for status messages

  example:
	{
    "publicKey": "25b272a71555322d40efe449a7f99af8fd364b92d350f1664481b2da340a02d0",
    "signature": "6725733046b35fa3a7e8dc0099a2b3dff10d3fd8b0f6da70d094352e3f5d27a8bc3f5586cf0bf71befc22536c3c50ec7b1d64398d43c3f4cde778e579e88af05",
    "links": [
      "5049d089a650aa896cb25ec35258653be4df196b4a5e5b6db7ed024aaa89e1b3"
    ],
    "postType": 0 || -1
    "channel": "default",
    "postHash": <hash>
    "timestamp": 80,
    "text": "h€llo world"
	}
  */

  getVirtualMessages (opts) {
    const limit = opts.limit
    const newerThan = parseFloat(opts.tsNewerThan || 0)
    const olderThan = parseFloat(opts.tsOlderThan || Infinity)
    var filtered = this.virtualMessages.filter((m) => {
      return (parseFloat(m.timestamp) > newerThan && parseFloat(m.timestamp) < olderThan)
    })
    return stableSort(filtered, v => parseFloat(v.timestamp)).slice(-limit)
  }

  interleaveVirtualMessages (messages, opts) {
    const virtualMessages = this.getVirtualMessages(opts)

    var cmp = (a, b) => {
      // sort by timestamp
      const diff = parseFloat(a.timestamp) - parseFloat(b.timestamp)
      // if timestamp was the same, and messages are by same author, sort by seqno
      return diff
    }
    return virtualMessages.concat(messages).sort(cmp).slice(-opts.limit)
  }

  // addVirtualMessage({ timestamp: Date.now(), postType: -1 ("status") OR -2 ("status/date-changed"), text: "" }})
  addVirtualMessage (msg) {
    /*
    msg will be on the format of
    {timestamp, type, text}
    but we convert it to the format that cabal expects messages to conform to
     msg = {
         publicKey: ''
         signature: ''
         timestamp: ''
         links: [],
         postType: -1,
         postHash: '',
         channel: '',
         text: ''
     }
     */
    msg = {
      publicKey: this.name,
      // TODO (2023-08-01): do we want to use mono-timestamp like this?
      timestamp: msg.timestamp || timestamp(),
      postType: msg.postType || postTypes.STATUS_GENERAL,
      channel: this.name,
      text: msg.text
    }
    this.virtualMessages.push(msg)
  }

  // returns false if we were already in the channel, otherwise true
  join () {
    let joined = this.joined
    this.joined = true
    return joined
  }

  // returns true if we were previously in the channel, otherwise false
  leave () {
    let joined = this.joined
    this.joined = false
    return joined
  }
}

class ChannelDetails extends ChannelDetailsBase {
  constructor (getChat, channelName) {
    super(channelName)
    this.getChat = getChat
  }

  getPage (opts, _causalSort, cb) {
    opts = opts || {}
    let start = opts.tsNewerThan || 0
    let end = opts.tsOlderThan || 0
    let limit = opts.limit || 500
    this.getChat(this.name, start, end, limit, (err, msgs) => {
      if (err) { debug("err getting chat", err); return cb([]); }
      _causalSort(msgs.filter(p => p !== null), (sorted) => {
        const reversed = []
        for (let i = sorted.length - 1; i >= 0; --i) {
          const msg = sorted[i]
          if (msg === null) { continue }
          reversed.push(msg)
          const msgTime = msg.timestamp
          const dayTimestamp = msgTime - (msgTime % (24 * 60 * 60 * 1000))
          if (!this.datesSeen.has(dayTimestamp)) {
            this.datesSeen.add(dayTimestamp)
            this.addVirtualMessage({
              publicKey: "status",
              postHash: "",
              timestamp: dayTimestamp,
              postType: postTypes.STATUS_DATE_CHANGED /*'status/date-changed' */,
              text: ""
            })
          }
        }
        cb(this.interleaveVirtualMessages(reversed, opts))
      })
    })
  }
}

module.exports = { ChannelDetails }
