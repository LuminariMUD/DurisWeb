-- Offline screenshot fixture for ../../2026-10-15-mudlet-gui-page-plan.md.
-- Load only through the Duris Test Companion in a disposable, disconnected profile.
-- All names, dialogue, items, combat, and geography below are invented demonstration data.
-- The distributable ArjUI, ArjMapper, and ArjAuto source is not modified.
local T = DurisTest
ArjUI.initialDataRequested = true

local members = {
  {name="Aster", hp=842, maxHp=1000, move=108, maxMove=120, position="standing", rank="back", inRoom=true},
  {name="Hale", hp=1250, maxHp=1500, move=95, maxMove=120, position="standing", rank="head", inRoom=true},
  {name="Mira", hp=620, maxHp=800, move=110, maxMove=120, position="standing", rank="back", inRoom=true},
  {name="Kestrel", hp=710, maxHp=900, move=72, maxMove=120, position="standing", rank="back", inRoom=false},
}

local function say(channel, sender, message)
  T.emit("Comm.Channel", {channel=channel, sender=sender, text=message, alignment="good"})
end

local function scene(lines)
  ArjUI.console:clear()
  feedTriggers("\27[33mOFFLINE DEMONSTRATION - invented characters and world data\27[0m\n\n")
  feedTriggers(table.concat(lines, "\n") .. "\n")
end

T.steps({
  {name="overview", wait=1, run=function()
    T.emit("Char.Status", {name="Aster", level=25, class="Psionicist", race="Human", alignment="good", guild="Wayfarers", title="Demo character"})
    T.emit("Char.Vitals", {hp=842, maxHp=1000, mana=368, maxMana=500, move=108, maxMove=120, exp=48200, tnl=5000,
      platinum=4, gold=32, silver=18, copper=7, position="standing", usesMana=true})
    T.emit("Char.Vitals", {hp=842, maxHp=1000, mana=368, maxMana=500, move=108, maxMove=120, exp=49350, tnl=3850,
      position="standing", usesMana=true})
    T.emit("Group.Status", {size=4, maxSize=8, members=members})
    T.emit("Room.Info", {
      num=90010, zone=9001, name="The Bronze Gate", area="The Bronze Citadel (demo)",
      exits={north=90011, south=90012, east=90013, west=90014}, doors={east="closed"},
      npcs={{name="a citadel sentry", colored_name="&+Ya citadel sentry"}, {name="a bronze guardian", colored_name="&+Ra bronze guardian"}},
      items={{name="a weathered sign", colored_name="&+ya weathered sign"}, {name="a silver lantern", colored_name="&+Wa silver lantern"}},
      players={{name="Hale", alignment="good"}, {name="Mira", alignment="good"}},
    })
    T.emit("Char.Affects", {{name="sanctuary", duration=600}, {name="stone skin", duration=300}, {name="fly", duration=900}})
    T.emit("Quest.Status", {active=true, type="kill", target="bronze guardians", killCount=2, killRequired=5, remaining=6, mapBought=false})
    say("gcc", "Mira", "Meet at the bronze gate. I have the lantern.")
    say("gsay", "Hale", "Stay together. We will take the northern hall.")
    say("tell", "Kestrel", "One room behind you. Keep the east door closed.")
    say("nchat", "Wayfarer", "Welcome to Duris. Ask if you need a hand.")
    ArjUI:switchChatTab("all")
    scene({
      "\27[36mThe Bronze Gate\27[0m",
      "  A high arch of dark stone frames the entrance to the citadel.",
      "  Bronze leaves gleam beneath a canopy of weathered banners.",
      "  Footsteps echo through the northern hall; a cool draft slips",
      "  beneath the closed door to the east.",
      "",
      "\27[33mExits: north, south, east (closed), west\27[0m",
      "A citadel sentry watches the archway.",
      "A bronze guardian stands motionless beside the eastern door.",
      "A weathered sign hangs from the wall.",
      "A silver lantern rests on a stone ledge.",
      "Hale and Mira are standing here.",
      "",
      "> look sign",
      "The sign reads: 'Those who enter together return together.'",
      "",
      "> glance north",
      "The northern hall opens into a broad, pillared courtyard.",
      "Beyond it, the stairs climb toward the watchtower.",
      "",
      "The game stays in the center. Maps, vitals, party, and chat",
      "remain visible around it.",
    })
    ArjUI:renderAll()
  end, verify=function()
    T.check(ArjMapper.state.lastDisplayMode=="zone" and ArjMapper.state.zoneData[9001], "demonstration zone map rendered")
    T.check(ArjUI.playerName=="Aster" and #ArjUI.state.group==4, "demonstration character and group rendered")
    for key in pairs(ArjAuto.toggleDefaults) do T.check(ArjAuto.settings[key]==false, key.." remains off") end
  end},
  {name="combat-group", wait=.5, run=function()
    members[1].hp = 714
    members[1].move = 91
    members[2].hp = 610
    T.emit("Group.Status", {size=4, maxSize=8, members=members})
    T.emit("Char.Vitals", {hp=714, maxHp=1000, mana=241, maxMana=500, move=91, maxMove=120, position="standing", fighting="a bronze guardian"})
    T.emit("Combat.Update", {target={name="a bronze guardian", healthPercent=40, health="big nasty wounds", position="standing"},
      round={attacker="Aster", damage=148, damageType="psychic", critical=false}})
    T.emit("Char.Affects", {{name="sanctuary", duration=540}, {name="stone skin", duration=240}, {name="fly", duration=840}, {name="poison", duration=90}})
    say("gsay", "Mira", "Healing Hale. Keep the guardian focused on the front rank.")
    say("gsay", "Kestrel", "Still outside the room. Coming through the gate now.")
    ArjUI:switchChatTab("group")
    scene({
      "\27[36mThe Bronze Gate\27[0m",
      "The bronze guardian steps away from the eastern door.",
      "Hale moves to the front of the group.",
      "",
      "> assist Hale",
      "\27[33mYou focus your thoughts on the bronze guardian.\27[0m",
      "The guardian's heavy blade strikes Hale's shield.",
      "Mira calls out a warning from behind the front rank.",
      "",
      "\27[35mA wave of psychic force crashes into the bronze guardian.\27[0m",
      "[Damage: 148]",
      "The bronze guardian has some big nasty wounds.",
      "",
      "\27[32mMira begins a healing prayer for Hale.\27[0m",
      "You hold your position at the center of the group.",
      "",
      "< T: Hale TP: sta TC: big nasty wounds E: a bronze guardian EP: sta EC: big nasty wounds>",
    })
  end, verify=function()
    T.check(ArjUI.damage.fight==148, "one displayed damage total without duplicate text counting")
    T.check(ArjUI.state.tank=="Hale" and ArjUI.state.target=="a bronze guardian", "target and prompt-derived tank rendered")
    T.check(T.lines("ArjUI_DebuffsBox"):find("poison",1,true), "negative affect displayed")
  end},
  {name="chat-equipment", wait=.5, run=function()
    T.emit("Combat.Update", yajl.to_value('{"target":null,"tank":null}'))
    T.emit("Char.Affects", {{name="sanctuary", duration=500}, {name="stone skin", duration=200}, {name="fly", duration=800}})
    feedTriggers("You are using:\n<wielded> a bronze-edged staff\n<worn on body> a traveller's coat\n<worn on head> a silver circlet\n<worn on hands> supple leather gloves\n<worn on feet> boots of the road\n< 714h/1000H 91v/120V Pos: standing>\n")
    ArjUI:switchTab("eq")
    say("gcc", "Mira", "The northern passage is clear. Bring your light.")
    say("gcc", "Hale", "We will regroup at the next archway.")
    say("tell", "Kestrel", "I found the west passage. Shall I scout ahead?")
    say("tell", "You -> Kestrel", "Hold there. We will join you after the courtyard.")
    ArjUI:switchChatTab("guild")
    scene({
      "\27[36mThe Bronze Gate\27[0m",
      "The courtyard grows quiet as the last echo fades.",
      "You check your equipment before moving on.",
      "",
      "> equipment",
      "You are using:",
      "<wielded>       a bronze-edged staff",
      "<worn on body>  a traveller's coat",
      "<worn on head>  a silver circlet",
      "<worn on hands> supple leather gloves",
      "<worn on feet>  boots of the road",
      "< 714h/1000H 91v/120V Pos: standing>",
      "",
      "Guild coordination and individual tells have their own space.",
      "Your next command is still within reach.",
    })
    ArjUI:openPrivateChat("Kestrel")
  end, verify=function()
    T.check(ArjUI.activeTab=="eq" and #ArjUI.state.equipment.lines==5, "equipment tab populated from text")
    T.check(ArjUI.privateChats.kestrel and #ArjUI.privateChats.kestrel.history>=3, "private tell window has session history")
  end},
  {name="wilderness", wait=.5, run=function()
    -- Use the same widget operation as the tell window's close control.
    ArjUI.privateChats.kestrel.window:hide()
    ArjUI.privateChats.kestrel.visible = false
    ArjUI:switchTab("stats")
    T.emit("Room.Info", {num=0, zone=600, name="The Open Plains", area="Citadel outskirts (demo)", exits={north=true,east=true,south=true,west=true}})
    T.emit("Room.Map", {map=table.concat({
      "&+G....&+W^^^^^^&+G........&+B~~~&+G..",
      "&+G.....&+W^^^^&+G..........&+B~~&+G..",
      "&+G.....&+y..&+G...........&+B~~~&+G..",
      "&+G..&+g****&+y..&+G..........&+B~~&+G...",
      "&+G..&+g****&+y....&+R@&+y.......&+B~~&+G...",
      "&+G...&+g***&+y..&+G.........&+B~~~&+G...",
      "&+G.....&+y..&+G.........&+B~~~~&+G...",
      "&+G....&+y..&+G...........&+B~~~&+G...",
      "&+G...&+y..&+G...........&+B~~~~&+G...",
    }, "\n")})
    ArjUI:switchChatTab("all")
    scene({
      "\27[32mThe Open Plains\27[0m",
      "  The road winds away from the bronze walls and out into",
      "  open country. Mountains rise above the treeline to the",
      "  north. A river glints in the distance to the east.",
      "",
      "\27[33mExits: north, east, south, west\27[0m",
      "",
      "> look",
      "You pause to take your bearings before choosing the next path.",
      "",
      "The map follows the setting: a zone layout inside the citadel,",
      "and the server's wilderness view out on the plains.",
    })
  end, verify=function()
    T.check(ArjMapper.state.lastDisplayMode=="wilderness", "wilderness map rendered")
    T.check(ArjUI.activeTab=="stats" and ArjUI.state.quest.killCount==2, "character and quest details retained")
    T.check(select(3,getConnectionInfo())==false, "capture stayed disconnected")
  end},
})
