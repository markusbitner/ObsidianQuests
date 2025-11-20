# ObsidianQuests

A plugin for Obsidian to keep track of quests, levelling, and XP

## Creating Quests
For the sake of this plugin, a quest is simply any note with the metadata: "quest: true". There is other metadata as well, but this is the most important one.

The default means of creating a quest is to click the **crossed swords** icon in the sidebar. You will be prompted to enter the following information:
- Quest name
- Quest type
- XP reward

Once you click "Create Quest", the quest document will be created in in folder specified in the **plugin settings**.

You can also create quests by using **templates**; just make sure you have the necessary metadata in the template file.

## Level Progression
As you complete quests by changing their status to "completed" in the metadata, you will gain whatever XP was assigned to those quests. This will allow you to level up, which can be seen in the **Level Progression** file. By default, this file is located in `_meta —> Level Progression.md`

In this file, you will see:
- Your current level
- Your total XP
- A progress bar displaying your progress towards the next level
- The XP required for the next level
- A chart displaying each level, the XP required for it, and the reward granted for reaching it

NOTE: You can edit the rewards by typing directly into the boxes, but because the table automatically refreshes and updates every five seconds, you will have only five seconds before you must re-select the cell to continue typing.

## Quest Logs
While there is no quest log feature in this plugin, I highly recommend using Obsidian's **Bases** plugin (a core plugin). You will be able to filter by quest type, completion status, XP rewards, and start/end dates.

## Link Decoration
By default, links to quest documents will automatically display the quest type, and the timeframe, if applicable, **but only in reading view** or in table cells.