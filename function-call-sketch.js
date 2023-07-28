details = cabal.new()
  -cabal.initalize()

details.getLocalUser()

details.join(channel)
  -details.focus(channel)
details.channelInformation(channel).renderChannel(channelObj)
details.getTopic(channel).renderTopic()
details.getUsers(channel).renderUsers(usersObj)

/* get chat */
details.getChat(joinedChannel)

// alt 1: ts-based
getChat(channel, { limit: 200 })
getChat(channel, { tsOlderThan: 1hourago, limit: 200 })
getChat(channel, { tsOlderThan: 0, tsNewerThan: 2hoursAgo, limit: 200 })
getChat(channel, { tsNewerThan: 2hoursAgo, limit: 200 })

// alt 2: hash-based
getChat(channel, { limit: 200 })
getChat(channel, { olderThanHash: hash, limit: 200 })
getChat(channel, { newerThanHash: hash, olderThanHash: hash, limit: 200 })

/* use links + ts info to causally sort postArray and return sorted */
const sorted = _causalSort(postArray)

// paginate is still speculative; unsure how to make it work good in practice
// i think get chat with time+hash anchors and limits is better?

// scroll up
// details.paginate({clientOptions, direction: intoHistory}).render(messages)
// scroll down
// details.paginate({clientOptions, direction: intoFuture}).render(messages)

details.postText(channel, "hello wurld")

details.on("chat-message", render(channel, hash, msg))
details.on("topic", setTopic(channel, hash, msg))
details.on("message-removed", updateRender(channel, hash, { remove:true }))
details.on("name-changed", updateRender(pubkey, newName))
details.on("new-channel", (channel))

details.postText(channel, "askdjhcx") // a typo is made (cat walks on keyboard); hash = hashMsg
// Q: should we render deleted post as "*this post was deleted*"? e.g. with a virtual message `type: deleted`
details.deleteSingle(hashMsg)
details.setName("cabler")

// annoying comment is made that i'd rather just not see locally
details.dropSingle(hashAnnoying)

details.focus(nextChannel)

details.getChannels()
