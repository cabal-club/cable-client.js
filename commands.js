// SPDX-FileCopyrightText: 2023 the cable-client authors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const constants = require("cable.js/constants.js")

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
  share: {
    help: () => 'print a cabal key, useful for sending to friends',
    category: ["basics", "sharing"],
    call: (cabal, res, arg) => {
      const key = `cabal://${cabal.key}` // add back admin key once cable has mod actions
      res.info(key, { data: { key } })
      res.end()
    }
  },
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
  clear: {
    help: () => 'clear the current backscroll',
    category: ["basics", "misc"],
    call: (cabal, res, arg) => {
      const chan = cabal.getCurrentChannel()
      cabal.clearStatusMessages(chan)
      res.end()
    }
  },
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
      const whoisKeys = users.keys().filter((k) => users[k].name && users[k].name === arg)
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
      if (!users.has[arg]) {
        res.error("no user associated with key", arg)
        return
      }
      res.info(`${arg} is currently known as: ${users[arg].name || "<unset nickname>"}`)
      res.end()
    }
	},
	hide: {
		help: () => 'hide a user\'s message across the whole cabal',
		category: ["moderation", "basics"],
		call: (cabal, res, arg) => {
			flagCmd('hide', cabal, res, arg)
		}
	},
	unhide: {
		help: () => 'unhide a user across the entire cabal',
		category: ["moderation", "basics"],
		call: (cabal, res, arg) => {
			flagCmd('unhide', cabal, res, arg)
		}
	},
	hides: {
		help: () => 'list hides',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			listCmd('hide', cabal, res, arg)
		}
	},
	block: {
		help: () => 'block a user',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			flagCmd('block', cabal, res, arg)
		}
	},
	unblock: {
		help: () => 'unblock a user',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			flagCmd('unblock', cabal, res, arg)
		}
	},
	blocks: {
		help: () => 'list blocks',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			listCmd('block', cabal, res, arg)
		}
	},
	mod: {
		help: () => 'add a user as a moderator',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			flagCmd('mod', cabal, res, arg)
		}
	},
	unmod: {
		help: () => 'remove a user as a moderator',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			flagCmd('unmod', cabal, res, arg)
		}
	},
	mods: {
		help: () => 'list mods',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			listCmd('mod', cabal, res, arg)
		}
	},
	admin: {
		help: () => 'add a user as an admin',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			flagCmd('admin', cabal, res, arg)
		}
	},
	unadmin: {
		help: () => 'remove a user as an admin',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			flagCmd('unadmin', cabal, res, arg)
		}
	},
	admins: {
		help: () => 'list admins',
		category: ["moderation"],
		call: (cabal, res, arg) => {
			listCmd('admin', cabal, res, arg)
		}
	}
}

function parseOptions (input) {
  const output = {}
  const options = input.slice(input.indexOf("--")).split(/(\s+|^)--/).map(s => s.trim()).filter(s => s !== "")
  options.forEach(option => {
    const i = option.indexOf(" ")
    // this introduces support for parameter-less --flags i.e. binary flags
		if (i < 0) { 
      output[option] = true
      return
    }
    const optionType = option.slice(0, i)
    output[optionType] = option.slice(i).trim()
  })
  return output
}

// extract --<option>. the currently implemented options are: --reason <reason>, --channel <channel>, --privacy (no param)
// option order does not matter: --reason foo --channel bar and --channel bar --reason foo are equivalent
function extractModerationOptions (input, defaultChannel, defaultReason = '', defaultPrivacy=false) {
  let channel = defaultChannel
  let reason = defaultReason
	let isPrivate = defaultPrivacy
  if (input.indexOf("--") >= 0) {
    const options = parseOptions(input)
    channel = options["channel"] || channel
    reason = options["reason"] || reason
    isPrivate = options["private"] || isPrivate
  }
  return { channel, reason, isPrivate }
}

function cmpUser (a, b) {
  if (a.online && !b.online) return -1
  if (b.online && !a.online) return 1
  if (a.name && !b.name) return -1
  if (b.name && !a.name) return 1
  if (a.name && b.name) return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
  return a.key < b.key ? -1 : 1
}

function flagCmd (cmd, cabal, res, arg) {
  const args = arg ? arg.split(/\s+/) : []
  if (args.length === 0) {
    res.info(`usage: /${cmd} NICK{.PUBKEY} {REASON...}`)
    return res.end()
  }
  let id = args[0]
  const keys = parseNameToKeys(cabal, id)
  if (keys.length === 0) {
    res.info(`no matching user found for ${id}`)
    return res.end()
  }
  if (keys.length > 1) {
    res.info('more than one key matches:')
    keys.forEach(key => {
      res.info(`  /${cmd} ${id.split('.')[0]}.${key}`)
    })
    return res.end()
  }
  id = keys[0]
  const type = /^un/.test(cmd) ? 'remove' : 'add'
  const flag = cmd.replace(/^un/, '')
  const options = args.slice(1).join(' ') // if no --<option> flags are found, assume `options` only contains the reason

  let { channel, reason, isPrivate } = extractModerationOptions(options, "", options, false) // if --channel option missin: assume default channel is '' i.e. the cabal context
  // cable-core accepts privacy as a 0 or 1
  let privacy = 0
  if (isPrivate) {
    privacy = 1
  }

  if (channel !== '' && !cabal.channels.has(channel)) {
    return res.error(`channel ${channel} does not exist`)
  }

  const recipient = cabal.users.get(id)
  if (id === cabal.localUser.key) {
    return res.error(`cannot issue roles or moderation actions on self`)
  }
  const peerName = recipient.name
  const placeModifier = channel === '' ? 'for the entire cabal' : `in channel ${channel}` 
  if (['admin', 'mod'].includes(flag)) {
    if (/^un/.test(cmd) && flag === 'mod' && !recipient.isModerator(channel)) {
      return res.error(`${peerName} is not a mod ${placeModifier}`)
    } else if (/^un/.test(cmd) && flag === 'admin' && !recipient.isAdmin(channel)) {
      return res.error(`${peerName} is not an admin ${placeModifier}`)
    } else if (!/^un/.test(cmd) && flag === 'mod' && recipient.isModerator(channel)) {
      return res.error(`${peerName} is already a mod ${placeModifier}`)
    } else if (!/^un/.test(cmd) && flag === 'admin' && recipient.isAdmin(channel)) {
      return res.error(`${peerName} is already an admin ${placeModifier}`)
    }
  } else if (flag === "hide") {
    if (/^un/.test(cmd)) {
      if (!recipient.isHidden(channel)) {
        return res.error(`cannot unhide ${peerName}: they are not hidden`)
      }
    } else {
      if (recipient.isHidden(channel)) {
        return res.error(`${peerName} is already hidden`)
      }
    }
  } else if (flag === "block") {
    if (/^un/.test(cmd)) {
      if (!recipient.isBlocked(channel)) {
        return res.error(`cannot unblock ${peerName}: they are not blocked`)
      }
    } else {
      if (recipient.isBlocked(channel)) {
        return res.error(`${peerName} is already blocked`)
      }
    }
  }
	
  const timestamp = +(new Date())
  // TODO (2024-03-20): adjust and add operations on post + channel types as well?
  let role
  let action
  // TODO (2024-03-20): block + unblock - add option parsing for "{un,}drop" and "notify"

  // TODO (2024-04-02): hard coding the options for drop/undrop/notify for alpha version of blocking
  const DROP = 0
  const NOTIFY = 1
  const UNDROP = 1
  switch (flag) {
    case "admin":
      role = (type === "add") ? constants.ADMIN_FLAG : constants.USER_FLAG
      cabal.core.assignRole(id, channel, timestamp, role, reason, privacy, () => {
        if (type === "add") {
          res.info(`${peerName} was assigned role admin`)
        } else {
          res.info(`${peerName} was removed from being an admin`)
        }
        res.end()
      })
      break
    case "mod":
      role = (type === "add") ? constants.MOD_FLAG : constants.USER_FLAG
      res.info(`assign role ${role}`)
      cabal.core.assignRole(id, channel, timestamp, role, reason, privacy, () => {
        if (type === "add") {
          res.info(`${peerName} was assigned role mod`)
        } else {
          res.info(`${peerName} was removed from being an mod`)
        }
        res.end()
      })
      break
    case "user":
      role = constants.USER_FLAG
      cabal.core.assignRole(id, channel, timestamp, role, reason, privacy, () => {
        res.info(`${peerName} was set as role user`)
        res.end()
      })
      break
    case "hide":
      // TODO (2024-03-20): add /command capability to act on many users at once
      // TODO (2024-03-20): unify general purpose arguments across assignRole and moderate*
      action = (type === "add") ? constants.ACTION_HIDE_USER : constants.ACTION_UNHIDE_USER
      cabal.core.moderateUsers([id], channel, action, reason, privacy, timestamp, () => {
        res.info(`${peerName} was ${type === "add" ? "hidden" : "unhidden"}`)
        res.end()
      })
      break
    case "block":
      if (type === "add") { 
        cabal.core.blockUsers([id], DROP, NOTIFY, reason, privacy, timestamp, () => {
          res.info(`${peerName} was blocked`)
          res.end()
        })
      } else {
        cabal.core.unblockUsers([id], UNDROP, reason, privacy, timestamp, () => {
          res.info(`${peerName} was unblocked`)
          res.end()
        })
      }
      break
    default:
      res.error(`flagCmd: unhandled flag ${flag} in ${cmd}`)
  }

  // cabal.moderation.setFlag(flag, type, channel, id, reason).then(() => {
  //   // we added a new mod => process archived channels
  //   if (['mod', 'admin'].indexOf(flag) >= 0) {
  //     // set currently archived status according to current mods
  //     cabal.core.archives.get((err, archivedChannels) => {
  //       cabal.getChannels({ includeArchived: true }).forEach(ch => cabal.channels[ch].unarchive()) // reset archive status
  //       archivedChannels.forEach(ch => {
  //         if (cabal.channels[ch]) { cabal.channels[ch].archive() }
  //       })
  //       res.end()
  //     })
  //   } else {
  //     res.end()
  //   }
  // }).catch((err) => { res.error(err) })
}

function getNameKeyMatchesFromCabal (cabal, name) {
  const lastDot = name.lastIndexOf('.')
  const keyPrefix = name.slice(lastDot + 1)
  const namePrefix = name.slice(0, lastDot)
  if (!keyPrefix.length || !namePrefix.length) return []

  const keys = Object.values(cabal.getUsers())
  return keys
    .filter((u) => u.name.startsWith(namePrefix) && u.key.startsWith(keyPrefix))
    .map(u => u.key)
}

function parseNameToKeys (cabal, name) {
  if (!name) return null

  const keys = []

  // If it's a 64-character key, use JUST this, since it's unambiguous.
  if (/^[0-9a-f]{64}$/.test(name)) {
    return [name]
  }

  // Is it NAME.KEYPREFIX (with exactly one match)?
  if (/\./.test(name)) {
    const matches = getNameKeyMatchesFromCabal(cabal, name)
    Array.prototype.push.apply(keys, matches)
  }

  // Is it a name?
  const users = cabal.getUsers()
  for (const [key, user] of users) {
    if (user.name === name) {
      keys.push(key)
    }
  }

  // Is name actually just a pubkey (i.e. a peer w/o name set)?
  if (keys.length === 0) { // check that keys === 0 to prevent impersonation by setting pubkey as their name
  for (const [key, user] of users) {
      if (key.substring(0, name.length) === name && user.name === "") {
        keys.push(key)
      }
    }
  }

  return keys
}

// function getPeerName (cabal, key) {
//   const users = cabal.getUsers()
//   if (users.has(key)) {
//     return users.get(key)
//   }
//   return key
// }

function listCmd (cmd, cabal, res, arg) {
  const args = arg ? arg.split(/\s+/) : []
  const channel = '@'

	res.info(`pretend we did list cmd for ${cmd}`) 
  res.end()
  // cabal.moderation._listCmd(cmd, channel).then((keys) => {
  //   if (keys.length === 0) {
  //     res.info(`you don't have any ${cmd}s`)
  //     res.end()
  //     return
  //   }
  //   keys.forEach((key) => {
  //     if (/^[0-9a-f]{64}@\d+$/.test(key)) {
  //       cabal.core.getMessage(key, function (err, doc) {
  //         if (err) return res.error(err)
  //         res.info(Object.assign({}, {
  //           text: `${cmd}: ${getPeerName(cabal, key)}: ` +
  //           (doc.timestamp ? strftime(' [%F %T] ', new Date(doc.timestamp)) : '') +
  //           (doc.content && doc.content.reason || '')
  //         }))
  //       })
  //     } else {
  //       res.info(Object.assign({}, {
  //         text: `${cmd}: ${getPeerName(cabal, key)}`
  //       }))
  //     }
  //   })
  // })
}
