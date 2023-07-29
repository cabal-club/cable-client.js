# cabal-cli invocations

## Client
* client.getCommands
* client.getUsers
* client.getJoinedChannels
* client.getNumberUnreadMessages
* client.getMentions
* client.getDetails
* client.getMessages(opts, (msgs)=>)
* client.focusChannel(ch)
* Client.getDatabaseVersion
* Client.getCabalDirectory
* client.markChannelRead
* client.createCabal
* client.getCurrentCabal

not important for alpha/pov (focusing on 1 cabal only for cable-client):
* client.cabalToDetails
* client.getCabalKeys
* (client.focusCabal(cabal))
* (client.getCabalKeys)
* client.addCabal(key)
* `(client._getCabalByKey)`

## cabalDetails
* details.key
* details.getUsers
* details.getTopic
* details.getLocalName
* details.getChannels
* details.getCurrentChannel
* details.addStatusMessage
* details.processLine

less important:
* (details.publishMessage) (used for headless only?)
* (details.showIds)
* details.core.adminKeys
* details.core.modKeys

cabal.on
* "info" (commands)
* "end" (commands)
* "update"
* "channel-archive" / "channel-unarchive"
* "private-message"
* "publish-private-message"
## channelDetails
## User
