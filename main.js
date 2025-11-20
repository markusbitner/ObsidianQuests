const {
  Plugin,
  PluginSettingTab,
  Setting,
  Modal,
  Notice,
  moment
} = require("obsidian");

// ---------- Default settings ----------

const DEFAULT_SETTINGS = {
  // Link decoration
  showQuestTypeInLinks: true,
  showXpInLinks: true,
  showTimeframeInLinks: true,

  // Level curve (0-based levels: 0 -> 1, 1 -> 2, etc.)
  progressionMode: "linear",  // "linear" | "quadratic" | "exponential"
  baseXp: 100,                // XP needed for level 0 -> 1
  growthFactor: 50,           // meaning depends on mode
  xpGrantingStatuses: "completed",

  // Level Progression note
  playerStatusNotePath: "_meta/Level Progression.md",
  maxDisplayLevel: 10,        // levels per page
  lastLevelPage: 1,           // persisted page between sessions
  levelRewards: {},           // { [levelNumber]: "Reward text" }

  // Quest creation
  defaultQuestFolder: "Quests",
  defaultQuestTypes: "Main, Side, Daily, Habit, Project"
};

// ---------- Helper classes ----------

class QuestCreationModal extends Modal {
  constructor(app, plugin, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "New Quest" });

    let name = "";
    const types = this.plugin.settings.defaultQuestTypes
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    let questType = types[0] || "Main";
    let xp = 100;

    new Setting(contentEl)
      .setName("Quest name")
      .addText((text) =>
        text.onChange((value) => {
          name = value;
        })
      );

    new Setting(contentEl)
      .setName("Quest type")
      .addDropdown((dropdown) => {
        for (const t of types) dropdown.addOption(t, t);
        dropdown.setValue(questType);
        dropdown.onChange((value) => {
          questType = value;
        });
      });

    new Setting(contentEl)
      .setName("XP reward")
      .addText((text) =>
        text
          .setPlaceholder("100")
          .setValue(String(xp))
          .onChange((value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n >= 0) xp = n;
          })
      );

    const buttonDiv = contentEl.createDiv({ cls: "quest-modal-buttons" });
    const submitButton = buttonDiv.createEl("button", { text: "Create quest" });
    submitButton.onclick = () => {
      if (!name.trim()) {
        new Notice("Please enter a quest name.");
        return;
      }
      this.close();
      this.onSubmit({ name: name.trim(), questType, xp });
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ObsidianQuestsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian Quests Settings" });

    // Link decoration
    containerEl.createEl("h3", { text: "Quest Link Decoration" });

    new Setting(containerEl)
      .setName("Show quest type in links")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showQuestTypeInLinks)
          .onChange(async (value) => {
            this.plugin.settings.showQuestTypeInLinks = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show XP in links")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showXpInLinks)
          .onChange(async (value) => {
            this.plugin.settings.showXpInLinks = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show timeframe in links")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showTimeframeInLinks)
          .onChange(async (value) => {
            this.plugin.settings.showTimeframeInLinks = value;
            await this.plugin.saveSettings();
          })
      );

    // Level curve
    containerEl.createEl("h3", { text: "Level Curve" });

    new Setting(containerEl)
      .setName("Progression mode")
      .setDesc(
        "Linear = steady growth, Quadratic = big jumps later, Exponential = very steep."
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption("linear", "Linear")
          .addOption("quadratic", "Quadratic")
          .addOption("exponential", "Exponential")
          .setValue(this.plugin.settings.progressionMode)
          .onChange(async (value) => {
            this.plugin.settings.progressionMode = value;
            await this.plugin.saveSettings();
            await this.plugin.recomputePlayerStatusNote();
          });
      });

    new Setting(containerEl)
      .setName("Base XP (level 0 → 1)")
      .setDesc("XP needed to go from level 0 to 1.")
      .addText((text) =>
        text
          .setPlaceholder("100")
          .setValue(String(this.plugin.settings.baseXp))
          .onChange(async (value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n > 0) {
              this.plugin.settings.baseXp = n;
              await this.plugin.saveSettings();
              await this.plugin.recomputePlayerStatusNote();
            }
          })
      );

    new Setting(containerEl)
      .setName("Growth factor")
      .setDesc(
        "Linear: extra XP per level; Quadratic: ramp strength; Exponential: interpreted as % growth (e.g. 120 = +20% per level)."
      )
      .addText((text) =>
        text
          .setPlaceholder("50")
          .setValue(String(this.plugin.settings.growthFactor))
          .onChange(async (value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n > 0) {
              this.plugin.settings.growthFactor = n;
              await this.plugin.saveSettings();
              await this.plugin.recomputePlayerStatusNote();
            }
          })
      );

    new Setting(containerEl)
      .setName("Statuses that grant XP")
      .setDesc(
        "Comma-separated. Only quests with these statuses will contribute XP (case-insensitive)."
      )
      .addText((text) =>
        text
          .setPlaceholder("completed")
          .setValue(this.plugin.settings.xpGrantingStatuses)
          .onChange(async (value) => {
            this.plugin.settings.xpGrantingStatuses = value;
            await this.plugin.saveSettings();
            await this.plugin.recomputePlayerStatusNote();
          })
      );

    // Level Progression note
    containerEl.createEl("h3", { text: "Level Progression Note" });

    new Setting(containerEl)
      .setName("Level progression note path")
      .setDesc("Where to write your level & XP overview.")
      .addText((text) =>
        text
          .setPlaceholder("_meta/Level Progression.md")
          .setValue(this.plugin.settings.playerStatusNotePath)
          .onChange(async (value) => {
            this.plugin.settings.playerStatusNotePath = value.trim();
            await this.plugin.saveSettings();
            await this.plugin.recomputePlayerStatusNote();
          })
      );

    new Setting(containerEl)
      .setName("Levels per page")
      .setDesc("How many levels to include per table page.")
      .addText((text) =>
        text
          .setPlaceholder("10")
          .setValue(String(this.plugin.settings.maxDisplayLevel))
          .onChange(async (value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n > 0) {
              this.plugin.settings.maxDisplayLevel = n;
              await this.plugin.saveSettings();
              await this.plugin.recomputePlayerStatusNote();
            }
          })
      );

    // Quest creation
    containerEl.createEl("h3", { text: "Quest Creation" });

    new Setting(containerEl)
      .setName("Default quest folder")
      .setDesc("Folder where new quests are created.")
      .addText((text) =>
        text
          .setPlaceholder("Quests")
          .setValue(this.plugin.settings.defaultQuestFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultQuestFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Quest types")
      .setDesc("Comma-separated list used in the creation modal.")
      .addText((text) =>
        text
          .setPlaceholder("Main, Side, Daily, Habit, Project")
          .setValue(this.plugin.settings.defaultQuestTypes)
          .onChange(async (value) => {
            this.plugin.settings.defaultQuestTypes = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

// ---------- Main plugin class ----------

module.exports = class ObsidianQuestsPlugin extends Plugin {
  async onload() {
    console.log("Loading Obsidian Quests plugin");
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Ensure shapes
    if (
      !this.settings.levelRewards ||
      typeof this.settings.levelRewards !== "object"
    ) {
      this.settings.levelRewards = {};
    }
    if (!this.settings.lastLevelPage || this.settings.lastLevelPage < 1) {
      this.settings.lastLevelPage = 1;
    }

    this.statusUpdateTimeout = null;
    this.levelPage = null; // in-memory current page

    // Ribbon icon
    this.addRibbonIcon("swords", "New quest", () => {
      new QuestCreationModal(this.app, this, (data) => {
        this.createQuestNote(data);
      }).open();
    });

    // Settings tab
    this.addSettingTab(new ObsidianQuestsSettingTab(this.app, this));

    // Link decoration
    this.registerMarkdownPostProcessor((el, ctx) => {
      this.decorateQuestLinks(el, ctx);
    });

    // Global click handler for pagination buttons
    this.registerDomEvent(document, "click", (evt) => {
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;

      const prevBtn = target.closest(".oq-page-prev");
      const nextBtn = target.closest(".oq-page-next");
      if (!prevBtn && !nextBtn) return;

      evt.preventDefault();
      evt.stopPropagation();

      const delta = prevBtn ? -1 : 1;
      this.changeLevelPage(delta).catch(console.error);
    });

    // XP recompute on metadata change, debounced to 5s
    this.registerEvent(
      this.app.metadataCache.on("changed", () => {
        if (this.statusUpdateTimeout != null) {
          window.clearTimeout(this.statusUpdateTimeout);
        }
        this.statusUpdateTimeout = window.setTimeout(() => {
          this.recomputePlayerStatusNote().catch(console.error);
        }, 5000);
      })
    );

    // Initial compute
    this.recomputePlayerStatusNote().catch(console.error);
  }

  onunload() {
    console.log("Unloading Obsidian Quests plugin");
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ---------- Pagination state change ----------

  async changeLevelPage(delta) {
    const pageSize =
      this.settings.maxDisplayLevel && this.settings.maxDisplayLevel > 0
        ? this.settings.maxDisplayLevel
        : 10;

    const currentDefault = 1;
    const current =
      this.levelPage || this.settings.lastLevelPage || currentDefault;

    let newPage = current + delta;
    if (newPage < 1) newPage = 1;

    this.levelPage = newPage;
    this.settings.lastLevelPage = newPage;
    await this.saveSettings();

    await this.recomputePlayerStatusNote();
  }

  // ---------- Quest link decoration ----------

  decorateQuestLinks(el, ctx) {
    // Support both <a> and <span> internal links (reading view & live preview)
    const links = el.querySelectorAll("a.internal-link, span.internal-link");

    for (let i = 0; i < links.length; i++) {
      const link = links[i];

      // Don't double-decorate the same link
      const next = link.nextElementSibling;
      if (
        next &&
        next.classList &&
        next.classList.contains("quest-link-badge")
      ) {
        continue;
      }

      const href =
        link.getAttribute("data-href") || link.getAttribute("href");
      if (!href) continue;

      const file = this.app.metadataCache.getFirstLinkpathDest(
        href,
        ctx.sourcePath
      );
      if (!file) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache && cache.frontmatter;
      if (!fm) continue;

      // Consider it a quest if explicitly marked OR it carries quest fields
      const isQuest =
        fm.quest === true ||
        fm.quest === "true" ||
        typeof fm.quest_type !== "undefined" ||
        typeof fm.xp !== "undefined";

      if (!isQuest) continue;

      const bits = [];

      if (this.settings.showQuestTypeInLinks && fm.quest_type) {
        bits.push(String(fm.quest_type));
      }

      let xpVal = fm.xp;
      if (this.settings.showXpInLinks && xpVal != null) {
        if (typeof xpVal === "string") {
          const n = Number(xpVal);
          if (!Number.isNaN(n)) xpVal = n;
        }
        if (typeof xpVal === "number") {
          bits.push(xpVal + " XP");
        }
      }

      if (this.settings.showTimeframeInLinks && (fm.start || fm.end)) {
        bits.push(this.formatTimeframe(fm.start, fm.end));
      }

      if (bits.length === 0) continue;

      const badge = document.createElement("span");
      badge.classList.add("quest-link-badge");
      badge.textContent = " [" + bits.join(" · ") + "]";
      link.insertAdjacentElement("afterend", badge);
    }
  }

  formatTimeframe(start, end) {
    const fmt = (d) => moment(d).format("MMM D");
    if (start && end) return fmt(start) + "–" + fmt(end);
    if (end) return "Due " + fmt(end);
    if (start) return "From " + fmt(start);
    return "";
  }

  // ---------- Level curve helpers ----------

  getXpGrantingStatusSet() {
    const raw = this.settings.xpGrantingStatuses || "completed";
    return new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
    );
  }

  // XP required to go from this level to the next (0-based levels)
  getXpForLevel(level) {
    const mode = this.settings.progressionMode || "linear";
    const base = this.settings.baseXp > 0 ? this.settings.baseXp : 100;
    const factor =
      this.settings.growthFactor && this.settings.growthFactor > 0
        ? this.settings.growthFactor
        : 50;

    switch (mode) {
      case "linear":
        // base + factor * level
        return base + factor * level;
      case "quadratic":
        // base + factor * level^2
        return base + factor * level * level;
      case "exponential": {
        // base * growth^level
        const growth = Math.max(1.01, factor / 100);
        return Math.floor(base * Math.pow(growth, level));
      }
      default:
        return base;
    }
  }

  // Total XP required to *reach* the given level (level 0 = 0 XP)
  getXpThresholdForLevel(level) {
    if (level <= 0) return 0;
    let total = 0;
    for (let l = 0; l < level; l++) {
      total += this.getXpForLevel(l);
    }
    return total;
  }

  // Given totalXp, compute current level and within-level progress (0-based levels)
  calculateLevelProgress(totalXp) {
    let level = 0;
    let xpRemaining = totalXp;
    let xpForNextLevel = this.getXpForLevel(level);

    let safety = 0;
    const maxLevels = 999;

    while (xpRemaining >= xpForNextLevel && safety < maxLevels) {
      xpRemaining -= xpForNextLevel;
      level++;
      xpForNextLevel = this.getXpForLevel(level);
      safety++;
    }

    const currentLevelXp = xpRemaining;
    const xpToNextLevel = xpForNextLevel - currentLevelXp;

    return {
      level,
      currentLevelXp,
      xpForNextLevel,
      xpToNextLevel
    };
  }

  // ---------- Read existing rewards from current Level Progression table ----------

  async readExistingRewards() {
    const rewards = {};
    const path =
      this.settings.playerStatusNotePath || "_meta/Level Progression.md";
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !file.extension) return rewards;

    let content;
    try {
      content = await this.app.vault.read(file);
    } catch (e) {
      console.error(
        "Obsidian Quests: failed to read level progression note",
        e
      );
      return rewards;
    }

    const lines = content.split("\n");
    const headerIndex = lines.findIndex((l) =>
      l.toLowerCase().includes("| level") &&
      l.toLowerCase().includes("| reward")
    );
    if (headerIndex === -1 || headerIndex + 2 >= lines.length) return rewards;

    for (let i = headerIndex + 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("|")) break;

      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 4) continue;

      // parts[1] = Level cell, parts[3] = Reward cell
      let levelText = parts[1].replace(/\*/g, "").trim();
      const match = levelText.match(/\d+/);
      if (!match) continue;
      const lvl = parseInt(match[0], 10);

      let rewardCell = parts[3].trim();
      if (
        rewardCell.startsWith("**") &&
        rewardCell.endsWith("**") &&
        rewardCell.length >= 4
      ) {
        rewardCell = rewardCell.slice(2, -2).trim();
      }

      rewards[lvl] = rewardCell;
    }

    return rewards;
  }

  // ---------- Player status / Level Progression note ----------

  async recomputePlayerStatusNote() {
    const files = this.app.vault.getMarkdownFiles();
    let totalXp = 0;
    const xpStatuses = this.getXpGrantingStatusSet();

    // Merge existing stored rewards with what the user typed in the current table
    const visibleRewards = await this.readExistingRewards();
    const rewardsMap = Object.assign(
      {},
      this.settings.levelRewards || {},
      visibleRewards || {}
    );

    // Sum XP from quests whose status grants XP
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache && cache.frontmatter;
      if (!fm || !fm.quest) continue;

      const status = String(fm.status || "unstarted").toLowerCase();
      if (!xpStatuses.has(status)) continue;

      if (typeof fm.xp === "number") {
        totalXp += fm.xp;
      }
    }

    // Compute level + within-level progress
    const progress = this.calculateLevelProgress(totalXp);
    const currentLevel = progress.level;

    // Progress bar width
    const percent =
      progress.xpForNextLevel === 0
        ? 1
        : progress.currentLevelXp / progress.xpForNextLevel;
    const pctStr = String(Math.round(percent * 100));

    // Paging
    const pageSize =
      this.settings.maxDisplayLevel && this.settings.maxDisplayLevel > 0
        ? this.settings.maxDisplayLevel
        : 10;

    const defaultPage = Math.floor(currentLevel / pageSize) + 1; // page that contains (currentLevel + 1)
    let page =
      this.levelPage || this.settings.lastLevelPage || defaultPage || 1;

    if (page < 1) page = 1;

    const startLevel = (page - 1) * pageSize + 1;
    const endLevel = startLevel + pageSize - 1;

    // Build progression table
    const tableLines = [];
    tableLines.push("| Level | XP | Reward |");
    tableLines.push("| ----- | --- | ------ |");

    for (let lvl = startLevel; lvl <= endLevel; lvl++) {
      const xpThreshold = this.getXpThresholdForLevel(lvl);
      const reached = currentLevel >= lvl;

      const levelCell = reached ? `**${lvl}**` : String(lvl);
      const xpCell = reached ? `**${xpThreshold}**` : String(xpThreshold);

      const rewardRaw = rewardsMap[lvl] || "";
      let rewardCell = rewardRaw;

      if (reached && rewardRaw) {
        const trimmed = rewardRaw.trim();
        if (
          trimmed.startsWith("**") &&
          trimmed.endsWith("**") &&
          trimmed.length >= 4
        ) {
          rewardCell = trimmed;
        } else {
          rewardCell = `**${rewardRaw}**`;
        }
      }

      tableLines.push(`| ${levelCell} | ${xpCell} | ${rewardCell} |`);
    }

    const contents = [
      `# Level **${currentLevel}**`,
      `## XP: ${totalXp}`,
      "",
      '<div class="oq-progress">',
      `  <div class="oq-progress-inner" style="width: ${pctStr}%;"></div>`,
      "</div>",
      "",
      `_${progress.currentLevelXp} / ${progress.xpForNextLevel} XP towards next level_`,
      "",
      "## Progression",
      "",
      `Page: ${page} (levels ${startLevel}-${endLevel})`,
      "",
      ...tableLines,
      "",
      '<div class="oq-pagination">',
      '  <button class="oq-page-prev">Previous</button>',
      `  <span class="oq-page-display">Page ${page}</span>`,
      '  <button class="oq-page-next">Next</button>',
      "</div>"
    ].join("\n");

    const path =
      this.settings.playerStatusNotePath ||
      "_meta/Level Progression.md";

    let file = this.app.vault.getAbstractFileByPath(path);

    if (!file) {
      const parts = path.split("/");
      if (parts.length > 1) {
        const folder = parts.slice(0, -1).join("/");
        if (!this.app.vault.getAbstractFileByPath(folder)) {
          await this.app.vault.createFolder(folder);
        }
      }
      await this.app.vault.create(path, contents);
    } else {
      await this.app.vault.modify(file, contents);
    }

    // Persist rewards + page
    this.levelPage = page;
    this.settings.lastLevelPage = page;
    this.settings.levelRewards = rewardsMap;
    await this.saveSettings();
  }

  // ---------- Quest creation ----------

  async createQuestNote(data) {
    const folder = this.settings.defaultQuestFolder || "";
    const safeName = data.name.replace(/[\\/#%^*?:"<>|]/g, "-").trim();
    const path = folder ? `${folder}/${safeName}.md` : `${safeName}.md`;

    if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    const frontmatterLines = [
      "---",
      "quest: true",
      `quest_type: ${data.questType}`,
      `xp: ${data.xp}`,
      "start:",
      "end:",
      "min_level:",
      "status: unstarted",
      "---"
    ];

    const bodyLines = [
      `# ${data.name}`,
      "",
      "Describe the quest here.",
      "",
      "#### Related Quests",
      "- "
    ];

    const content =
      frontmatterLines.join("\n") + "\n" + bodyLines.join("\n");

    const file = await this.app.vault.create(path, content);
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file);

    new Notice("Quest created: " + data.name);
  }
};
