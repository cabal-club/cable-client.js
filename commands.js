module.exports = {
  nick: {
    help: () => 'change your display name',
    category: ["basics"],
    alias: ['n', 'name'],
    call: (cabal, res, arg) => {
      if (arg === '') {
        res.info(cabal.user.name)
        return res.end()
      }
      cabal.setName(arg, (err) => {
        if (err) return res.error(err)
        res.info("you're now known as " + arg)
        res.end()
      })
    }
  },
/*
  share: {
    help: () => 'print a cabal key with you as admin. useful for sending to friends',
    category: ["sharing"],
    call: (cabal, res, arg) => {
      const adminkey = `cabal://${cabal.key}?admin=${cabal.user.key}`
      res.info(adminkey, { data: { adminkey } })
      res.end()
    }
  },
*/
  ids: {
    help: () => 'toggle showing ids at the end of nicks. useful for moderation',
    category: ["moderation"],
    call: (cabal, res, arg) => {
      cabal.showIds = !cabal.showIds
      res.info(`toggled identifiers ${cabal.showIds ? 'on' : 'off'}`)
      res.end()
    }
  },
  hashes: {
    help: () => 'toggle showing post hashes at the start of each message. useful for deletion',
    category: ["moderation"],
    call: (cabal, res, arg) => {
      cabal.showHashes = !cabal.showHashes
      res.info(`toggled hashes ${cabal.showHashes ? 'on' : 'off'}`)
      res.end()
    }
  },
  emote: {
    help: () => 'write an old-school text emote',
    category: ["basics"],
    alias: ['me'],
    call: (cabal, res, arg) => {
      cabal.postText(`/me ${arg}`, cabal.currentChannel, (err) => {
        if (err) res.error(err)
        else res.end()
      })
    }
  },
  say: {
    help: () => 'write a message to the current channel, useful for escaping a typed /<command>',
    category: ["misc"],
    call: (cabal, res, arg) => {
      cabal.postText(arg || '', cabal.currentChannel, (err) => {
        if (err) res.error(err)
        else res.end()
      })
    }
  },
/*
  search: {
    help: () => 'search the backlog for messages; /search <term> (--ch <channel name>)',
    category: ["misc"],
    call: (cabal, res, arg) => {
      if (!arg) { 
        return res.error(`/search <term> (--ch <channel>)`)
      }
      const opts = {}
      if (arg.indexOf("--ch") >= 0) {
        let [term, channel] = arg.split("--ch")
        if (!term || term.length === 0) { 
            return res.error(`/search <term> (--ch <channel>)`)
        }
        term = term.trim()
        channel = channel.trim()
        if (!cabal.channels[channel]) {
          res.error(`channel ${channel} does not exist`)
          res.error(`/search <term> (--ch <channel>)`)
          return 
        }
        opts.channel = channel.trim()
        arg = term
      }
      cabal.client.searchMessages(arg, opts).then((matches) => {
        const users = cabal.getUsers()
        res.info(`${matches.length} matching ${matches.length === 1 ? "log" : "logs"} found`)
        matches.forEach((envelope) => {
          let { message } = envelope
          if (message && message.value && message.value.type === "chat/text") {
            const user = users[message.key].name || message.key.slice(0, 8)
            const output = `<${user}> ${message.value.content.text}`
            res.info(output)
          }
        })
      })
    }
  },
*/
  names: {
    help: () => 'display the names and unique ids of the cabal\'s peers',
    alias: ["users"],
    category: ["basics"],
    call: (cabal, res, arg) => {
      let users = Array.from(cabal.getUsers().values()).sort(cmpUser)
      res.info('history of peers in cabal')
      users.map((u, i) => {
        var username = u.name
        var spaces = ' '.repeat(15)
        var paddedName = (username + spaces).slice(0, spaces.length)
        res.info(`${i+1}.  ${paddedName} ${u.key}`)
      })
    }
  },
  channels: {
    help: () => "display the cabal's channels",
    category: ["basics", "channels"],
    call: (cabal, res, arg) => {
      var joinedChannels = cabal.getJoinedChannels()
      var channels = cabal.getAllChannels()
      res.info(`there are currently ${channels.length} channels `)
      channels.map((c) => {
        const info = cabal.getInformation(c)
        var topic = info.get("topic") || ""
        var shortTopic = topic.length > 40 ? topic.slice(0, 40) + '..' : topic || ''
        var count = info.get("members").size
        var userPart = count ? `: ${count} ${count === 1 ? 'person' : 'people'}` : ''
        res.info({
          text: `  ${joinedChannels.includes(c) ? '*' : ' '} ${c}${userPart} ${shortTopic}`,
          channel: c,
          userCount: count,
          topic,
          joined: joinedChannels.includes(c)
        })
      })
      res.end()
    }
  },
  del: {
    help: () => 'delete a message you have authored',
    category: ["basics", "channels"],
    alias: ['delete'],
    call: (cabal, res, arg) => {
      arg = (arg.trim() || '').replace(/^0x/, '')
      if (arg === '') { return }
      const pubkey = cabal.getLocalUser().key
      // TODO (2023-08-25): filter out undefined messages from core's getChat
      cabal.getChat(cabal.getCurrentChannel(), {}, (msgs) => {
        const ownPosts = msgs.filter(m => {
          return m.publicKey === pubkey
        })
        const hashes = ownPosts.map(m => m.postHash)
        const foundHashes = hashes.filter(h => {
          return h.startsWith(arg)
        })
        // too many matches
        if (foundHashes.length > 1) {
          res.info("found multiple hashes starting with ${arg}:")
          foundHashes.forEach(hash => { 
            const text = ownPosts.filter(p => {
              return p.postHash.startsWith(hash)
            })[0].text
            res.info(`0x${hash}: ${text.slice(0,18)}`) 
          })
          res.info("/del <longer hash> to delete")
          return res.end()
        }
        // no matches
        if (foundHashes.length === 0) {
          res.info(`none of your own messages have a hash starting ${arg}`)
          return res.end()
        }
        // exactly right match
        if (foundHashes.length === 1) {
          cabal.deleteSingle(foundHashes[0], (err) => {
            if (err) { 
              return res.error(err) 
            }

            res.info(`deleted post ${arg}`)
            res.end()
          })
        }
      })
    }
  },
  join: {
    help: () => 'join a new channel',
    category: ["basics", "channels"],
    alias: ['j'],
    call: (cabal, res, arg) => {
      arg = (arg.trim() || '').replace(/^#/, '')
      if (arg === '') arg = 'default'
      cabal.join(arg)
			res.end()
    }
  },
  leave: {
    help: () => 'leave a channel',
    category: ["basics", "channels"],
    alias: ['l', 'part'],
    call: (cabal, res, arg) => {
      arg = (arg || '').trim().replace(/^#/, '')
      if (arg === '!status') return
      if (arg === '') arg = cabal.getCurrentChannel()
      cabal.leave(arg)
			res.end()
    }
  },
/*
  clear: {
    help: () => 'clear the current backscroll',
    category: ["basics", "misc"],
    call: (cabal, res, arg) => {
      cabal.client.clearStatusMessages()
      res.end()
    }
  },
*/
  topic: {
    help: () => 'set the topic/description/`message of the day` for a channel',
    category: ["channels", "basics"],
    alias: ['motd'],
    call: (cabal, res, arg) => {
      cabal.setTopic(arg, cabal.currentChannel, (err) => {
        if (err) res.error(err)
        else res.end()
      })
    }
  },
  whoami: {
    help: () => 'display your local user key',
    category: ["basics", "misc"],
    alias: ['key'],
    call: (cabal, res, arg) => {
      res.info('Local user key: ' + cabal.getLocalUser().key)
      res.end()
    }
  },
  whois: {
    help: () => 'display the public keys associated with the passed in nick',
    category: ["moderation", "misc"],
    call: (cabal, res, arg) => {
      if (!arg) {
        res.info('usage: /whois <nick>')
        res.end()
        return
      }
      const users = cabal.getUsers()
      const whoisKeys = Object.keys(users).filter((k) => users[k].name && users[k].name === arg)
      if (whoisKeys.length === 0) {
          res.info(`there's currently no one named ${arg}`)
          res.end()
          return
      }
      res.info(`${arg}'s public keys:`)
      // list all of arg's public keys in list
      for (var key of whoisKeys) {
        res.info(`  ${key}`)
      }
      res.end()
    }
  },
  whoiskey: {
    help: () => 'display the user associated with the passed in public key',
    category: ["moderation", "misc"],
    call: (cabal, res, arg) => {
      if (!arg) {
        res.info('usage: /whoiskey <public key>')
        res.end()
        return
      }
      arg = arg.trim().replace("\"", "")
      const users = cabal.getUsers()
      if (typeof users[arg] === "undefined") {
        res.error("no user associated with key", arg)
        return
      }
      res.info(`${arg} is currently known as: ${users[arg].name || "<unset nickname>"}`)
      res.end()
    }
  }
/*
  read: {
    help: () => 'show raw information about a message from a KEY@SEQ',
    category: ["misc"],
    call: (cabal, res, arg) => {
      var args = (arg || '').split(/\s+/)
      if (args[0].length === 0) {
        res.info('usage: /read KEY@SEQ')
        return res.end()
      }
      cabal.core.getMessage(args[0], function (err, doc) {
        if (err) return res.error(err)
        res.info(Object.assign({}, doc, {
          text: JSON.stringify(doc, 2, null)
        }))
        res.end()
      })
    }
  },
*/
}

function cmpUser (a, b) {
  if (a.online && !b.online) return -1
  if (b.online && !a.online) return 1
  if (a.name && !b.name) return -1
  if (b.name && !a.name) return 1
  if (a.name && b.name) return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
  return a.key < b.key ? -1 : 1
}
