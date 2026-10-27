// A reusable layout made entirely from ordinary editable canvas blocks.
(function () {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const uid = () => `block-${crypto.randomUUID()}`;
  const art = "assets/worldbuilding/castle.jpg";
  const artwork = name => `assets/worldbuilding/${name}.jpg`;
  const mapArt = "assets/beneath-the-veins-map-panel.png";
  const normalizeTitle = title => String(title || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function createLayoutBackup(page, snapshot) {
    const stamp = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const backup = createPage(`${page.title} — before dashboard (${stamp})`, page.parent, page.layout, page.category, "page", { skipTemplate: true });
    const scopedData = remapPageClipboardContent(snapshot, backup.id);
    for (const [keyName, value] of Object.entries(scopedData)) {
      const key = getPageContentStorageKey(keyName);
      if (!key) continue;
      const all = readStorageJSON(key, {});
      all[backup.id] = value;
      if (!writeStorageJSON(key, all)) throw new Error("Couldn't save the layout backup. Your current page has not been replaced.");
    }
    Object.assign(backup, snapshot.pageAppearance);
    if (!saveSanctumRegistry()) throw new Error("Couldn't save the layout backup.");
    return backup;
  }
  function findOrCreateCategory(pageId, label, aliases, summary, layout = "board-canvas") {
    const names = new Set([label, ...aliases].map(normalizeTitle));
    const linkedIds = new Set(getPageBlocks(pageId).map(block => block.linkedPageId).filter(Boolean));
    const existing = userPages.find(page => (page.parent === pageId || linkedIds.has(page.id)) && names.has(normalizeTitle(page.title)) && (layout !== "infinite-canvas" || page.layout === layout));
    if (existing) { if (!existing.summary) existing.summary = summary; return existing; }
    const created = createPage(label, pageId, layout, "none", "page", { skipTemplate: true });
    created.summary = summary;
    return created;
  }
  function buildWorldbuildingBlocks(page, previous, width, mood, categories) {
    const column = Math.max(192, Math.min(312, Math.floor((width - 192) / 5 / 24) * 24));
    const total = column * 5 + 96;
    const left = Math.max(24, Math.floor((width - total) / 48) * 24);
    const gap = 24;
    const deskW = 2 * column + gap;
    const quickX = left + deskW + gap;
    const quickW = total - deskW - gap;
    const blocks = [];
    const base = (type, x, y, w, h, extra = {}) => ({ id: uid(), type, dashboardRole: type, x, y, w, h, z: 10 + blocks.length, ...extra });
    const text = (html, x, y, w, h, extra = {}) => {
      const b = base("text", x, y, w, h, { bodyHTML: html, bg: "transparent", textColor: "#d9d0c1", padding: "3px 0px", ...extra });
      blocks.push(b); return b;
    };
    const heading = (title, x, y, w) => text(`<h2 class="worldbuilding-heading"><span>${esc(title)}</span></h2>`, x, y, w, 48, {dashboardRole:"heading"});
    const image = (src, x, y, w, h) => {
      const b = base("image", x, y, w, h, { bodyHTML: `<img src="${esc(src)}" alt="" draggable="false" loading="lazy" style="width:100%;height:100%;object-fit:cover">`, padding: "0px", radius: "5px", borderColor: "#4a4238" });
      blocks.push(b); return b;
    };
    const panel = (x,y,w,h) => text("",x,y,w,h,{bg:"#121314",borderColor:"#433e36",radius:"5px",dashboardRole:"panel",z:1});
    const recent = (count,x,y,w,h) => {
      const existing = previous.find(block => block.type === "data-callout" && block.dataCalloutSystemKey === "scope-last-opened-items" && String(block.dataCalloutSystemFormat) === String(count));
      const b = base("data-callout",x,y,w,h,{
        ...(existing || {}), x,y,w,h,z:30, dashboardRole:count === 1 ? "current" : "recent", dataCalloutLabel: count === 1 ? "Currently working on" : "Recent Pages",
        dataCalloutSourceType: "system", dataCalloutSystemKey: "scope-last-opened-items", dataCalloutSystemTargetKind:"current", dataCalloutSystemTargetPageId:"",
        dataCalloutSystemFormat:String(count),dataCalloutLabelPos: count === 1 ? "hidden" : "above",dataCalloutShowIcon:"false",dataCalloutSize:"sm",dataCalloutAlign:"left",
        dataCalloutShowProjectImage:"false",dataCalloutShowDateTime:count === 1 ? "false" : "true",dataCalloutDateStyle:"relative",
        bg:count === 1 ? "transparent" : "#121314", borderColor:count === 1 ? "transparent" : "#433e36",padding:count === 1 ? "3px 0px" : "12px 16px",radius:"5px"
      });
      blocks.push(b);
    };
    const card = (pageRecord,x,y,w,h = 168) => {
      const old = previous.find(block => ["page","domain"].includes(block.type) && block.linkedPageId === pageRecord.id);
      const key = Object.keys(categories).find(key => categories[key].id === pageRecord.id);
      const source = ({places:artwork("hero"),notes:art})[key] || artwork(key);
      blocks.push(base("page",x,y,w,h,{
        ...(old || {}), x,y,w,h,z:30,dashboardRole:`card-${key}`,linkedPageId:pageRecord.id,pageCardTitle:pageRecord.title,pageCardSummary:pageRecord.summary || "",
        pageCardIcon:pageRecord.icon || "◇", pageCardView:"gallery",pageCardGalleryStyle:"compact",pageCardHideIcon:0,
        pageCardImageMode:"custom",pageCardImageSrc:source,pageCardImagePos:key === "military" ? 32 : 50,
        padding:"0px",bg:"#121314",borderColor:"#4a4238",textColor:"#e1d8cb",radius:"5px"
      }));
    };
    const button = (label,icon,action,x,w,extra={}) => blocks.push(base("button",x,72,w,48,{
      buttonConfig:JSON.stringify({label,icon,size:"small",style:"outline",actions:[action],afterAction:"nothing",...extra}),padding:"0px",radius:"4px",textColor:"#e1d8cb",borderColor:"#4a4238"
    }));
    heading("On My Desk",left,24,deskW);
    heading("Quick Links",quickX,24,quickW);
    panel(left,72,column,240);
    text(`<span class="desk-symbol">${getUIIcon("target")}</span><span style="color:#aaa092">Currently working on:</span>`,left+24,96,column-48,24);
    recent(1,left+60,120,column-84,24);
    const goal = previous.find(block => block.dashboardRole === "goal" || (block.type === "text" && /Next (thing|goal)/i.test(block.bodyHTML || "")));
    text(goal?.bodyHTML || '<span style="color:#aaa092">Next goal:</span><br>Add your next goal',left+60,168,column-84,48,{dashboardRole:"goal"});
    text(`<span class="desk-symbol">${getUIIcon("bookmark")}</span>`,left+24,168,24,48);
    const reminders = previous.find(block => block.dashboardRole === "reminders" || (block.type === "text" && /Reminders/.test(block.bodyHTML || "")));
    text(reminders?.bodyHTML || '<span style="color:#aaa092">Reminders</span><br>• Add a reminder',left+60,240,column-84,48,{dashboardRole:"reminders"});
    text(`<span class="desk-symbol">${getUIIcon("list")}</span>`,left+24,240,24,48);
    image(artwork("desk"),left+column+gap,72,column,240);
    text('<p class="worldbuilding-handwritten">A world in progress<br>is still a world.</p>',left+column+gap+24,96,column-48,96,{dashboardRole:"desk-quote",padding:"12px",bg:"transparent"});
    const btnGap = 12;
    const btnW = (quickW - btnGap * 4) / 5;
    button("New Note","✎",{type:"create-note",askTitle:true,askBody:true,sourceType:"normal"},quickX,btnW);
    button("Add Page","+",{type:"create-page",title:"{input}",parentPageId:page.id,layout:"board-canvas",openAfter:true},quickX+btnW+btnGap,btnW,{inputPrompt:"Page title"});
    button("Find Pages","▤",{type:"open-page",targetPageId:"search"},quickX+(btnW+btnGap)*2,btnW);
    button("Timeline","◷",{type:"open-page",targetPageId:categories.timeline.id},quickX+(btnW+btnGap)*3,btnW);
    button("Mood Board","◇",{type:"open-page",targetPageId:mood.id},quickX+(btnW+btnGap)*4,btnW);
    recent(4,quickX,144,quickW-column-gap,168);
    image(artwork("white-roses"),quickX+quickW-column,144,column,168);
    text('<p style="font-size:14px;letter-spacing:4px;line-height:1.8;margin:0">DISCIPLINE<br>BUILDS<br>WORLDS</p>',quickX+quickW-column+24,192,column-48,96,{bg:"transparent",padding:"8px",dashboardRole:"flower-quote"});
    heading("Story & Writing",left,336,total);
    const storyW = Math.floor((total-column-gap*3)/3/24)*24;
    [categories.characters,categories.scenes,categories.notes].forEach((entry,i)=>card(entry,left+i*(storyW+gap),384,storyW));
    text('<p style="font-style:italic;line-height:1.8;margin:0">Same story.<br>Different angles.<br>A deeper truth.</p>',left+3*(storyW+gap),408,total-3*(storyW+gap),96);
    heading("World Compendium",left,576,total);
    ["places","factions","culture","magic","nature","faith","military","history","trade"].forEach((key,i)=>card(categories[key],left+(i%5)*(column+gap),624+Math.floor(i/5)*192,column));
    image(artwork("red-roses"),left+4*(column+gap),816,column,168);
    text('<p style="font-style:italic;line-height:1.7;margin:0">Everything<br>is connected.</p>',left+4*(column+gap),840,column,96,{padding:"24px",dashboardRole:"rose-quote"});
    const footerArt = image("assets/beneath-the-veins-world-header.png",left,1008,3*column+2*gap,144);
    footerArt.dashboardRole = "footer-art";
    text('<p style="font-size:14px;letter-spacing:4px;text-align:center;line-height:1.9;margin:0">SOME THINGS SHOULD STAY BURIED.<br>BUT YOU’RE HERE ANYWAY.</p>',left+column,1056,2*column,72,{bg:"transparent",padding:"8px",dashboardRole:"footer-quote"});
    blocks.push(base("mood-board",left+3*(column+gap),1008,column,144,{dashboardWidget:JSON.stringify({title:"Project Mood",targetPageId:mood.id})}));
    const tagSettings = previous.find(block => block.type === "page-tags")?.dashboardWidget;
    blocks.push(base("page-tags",left+4*(column+gap),1008,column,144,{dashboardWidget:tagSettings || JSON.stringify({title:"Tags (Quick Add)",suggestions:["World Building","Character","Magic","Idea","Research"]})}));
    // Keep other user-authored content in the current page, below the new layout.
    const usedIds = new Set(blocks.map(block=>block.id));
    const plainText = html => new DOMParser().parseFromString(html || "", "text/html").body.textContent.trim();
    const isOldPresetDecoration = block => {
      if (block.dashboardRole) return true;
      if (block.type === "text" && /class="desk-symbol"/.test(block.bodyHTML || "")) return true;
      if (["mood-board","page-tags"].includes(block.type)) return true;
      if (block.type === "image" && /assets\/(beneath-the-veins-|worldbuilding\/)/.test(block.bodyHTML || "")) return true;
      if (block.type === "button") { try { return ["New Note","Add Page","Find Pages","Timeline","Mood Board"].includes(JSON.parse(block.buttonConfig).label); } catch {} }
      return block.type === "text" && /^(On My Desk|Quick Links|World Compendium|More from this page|A world in progress\s*is still a world\.|DISCIPLINE\s*BUILDS\s*WORLDS|Same story\.\s*Different angles\.\s*A deeper truth\.|Everything\s*is connected\.|SOME THINGS SHOULD STAY BURIED\.\s*BUT YOU’RE HERE ANYWAY\.|Reminders\s*• Add a reminder|Next thing to do:|Next goal:|)$/i.test(plainText(block.bodyHTML));
    };
    const leftovers = previous.filter(block => !usedIds.has(block.id) && block !== goal && block !== reminders && !isOldPresetDecoration(block) && block.linkedPageId !== categories.timeline.id && !(
      block.type === "data-callout" && block.dataCalloutSystemKey === "scope-last-opened-items"
    ) && !(block.type === "text" && /^(QUICK NAVIGATION|Currently working on:|Next thing to do:|Story & Writing|\/)\s*$/i.test(plainText(block.bodyHTML))));
    if (leftovers.length) {
      heading("More from this page",left,1200,total);
      let y = 1248;
      leftovers.forEach(block=>{blocks.push({...block,x:left,y});y+=Math.max(block.h||48,48)+24;});
    }
    return blocks;
  }
  async function applyWorldbuildingLayout(pageId) {
    const page = userPages.find(entry => entry.id === pageId);
    if (!page || pageId !== getCurrentPageId() || page.layout !== "board-canvas") throw new Error("Open a regular board page to apply this layout.");
    if (!saveState()) throw new Error("Save the current page successfully before applying a layout.");
    const snapshot = createPageContentSnapshot(pageId);
    if (!snapshot) throw new Error("Couldn't read the current page.");
    const backup = createLayoutBackup(page, snapshot);
    if (await window.SanctumStorage?.flush() === false) throw new Error("Couldn't finish saving the backup. Your current layout has not been replaced.");
    const previous = getPageBlocks(pageId);
    const specs = {
      characters:["Characters",[],"People, relationships, arcs"],scenes:["Plot & Scenes",["Scenes"],"Outline, scenes, timelines"],notes:["Notes & Ideas",["Notes"],"Thoughts, snippets, inspiration"],
      timeline:["Timelines",["Timeline"],"Events and chronology"],places:["Places & Nations",["Locations","Places"],"Lands, cities, regions"],factions:["Factions & Power",["Factions"],"Groups, alliances, influence"],
      culture:["Culture & Society",[],"People, class, daily life"],magic:["Magic & Mana",["Magic"],"Systems, abilities, limits"],nature:["Elderkin & Nature",["Nature"],"Creatures, bonds, ecosystems"],
      faith:["Faith & Religion",["Religion"],"Beliefs, practices, gods"],military:["Military & Warfare",["Military"],"Knights, armies, strategy"],history:["History & Lore",["History","Lore"],"Events, eras, legends"],trade:["Trade & Technology",["Trade"],"Resources, innovation, goods"]
    };
    const categories = Object.fromEntries(Object.entries(specs).map(([key,args])=>[key,findOrCreateCategory(pageId,...args)]));
    const iconNames = {characters:"circle-user-round",scenes:"bookmark",notes:"sparkles",places:"globe",factions:"network",culture:"house",magic:"sparkles",nature:"flame",faith:"star",military:"focus",history:"history",trade:"anchor"};
    for (const [key,category] of Object.entries(categories)) {
      if ((!category.icon || category.icon === "📄") && iconNames[key]) {
        category.icon = "data:image/svg+xml," + encodeURIComponent(getUIIcon(iconNames[key]).replace('stroke="currentColor"','stroke="#c5ad95"'));
      }
    }
    const mood = findOrCreateCategory(pageId,"Project Mood",["Mood Board"],"Visual references and inspiration","infinite-canvas");
    const moodBlocks = getPageBlocks(mood.id);
    const seedArt = [artwork("red-roses"),artwork("military"),artwork("white-roses"),artwork("desk")];
    if (!moodBlocks.length || (moodBlocks.length === 2 && moodBlocks.every(block => block.type === "image" && /assets\/beneath-the-veins-(world-header|map-panel)\.png/.test(block.bodyHTML || "")))) {
      const images = seedArt.map((src,index)=>({id:uid(),type:"image",x:120+index*384,y:120,w:336,h:240,bodyHTML:`<img src="${esc(src)}" alt="Worldbuilding mood reference" style="width:100%;height:100%;object-fit:cover">`,padding:"0px"}));
      if (!setPageBlocks(mood.id, images)) throw new Error("Couldn't save the mood board.");
    }
    if (!saveSanctumRegistry()) throw new Error("Couldn't save the new category pages.");
    const width = document.getElementById("pageCanvas").clientWidth;
    const blocks = buildWorldbuildingBlocks(page,previous,width,mood,categories);
    const oldSettings = getPageSettings(pageId);
    if (!setPageBlocks(pageId,blocks)) throw new Error("Couldn't save the new layout. Your original is in the layout backup.");
    const settings = {...oldSettings,showHeader:true,headerSrc:art,headerSize:"xl",headerPos:38,showTitle:false,heroOverlay:true,heroOverlayTitle:page.title,fontPreset:"cormorant",canvasZoom:1,canvasScrollTop:0,canvasScrollLeft:0,canvasHasView:false};
    if (!savePageSettings(pageId,settings)) { setPageBlocks(pageId,previous); throw new Error("Couldn't save the banner; the original layout was restored."); }
    if (await window.SanctumStorage?.flush() === false) {
      setPageBlocks(pageId,previous);
      savePageSettings(pageId,oldSettings);
      throw new Error("The new layout couldn't be saved. The original layout has been restored; check the save indicator.");
    }
    clearGrid();
    loadPageBlocks(pageId);
    renderPageHero(pageId);
    applyPageFontPreset(pageId);
    pushHistory();
    renderSidebarDomains();
    if (document.body.classList.contains("editing")) document.getElementById("editToggle").click();
    document.getElementById("pageCanvas").scrollTop = 0;
    showAppToast(`Layout applied. Original saved as “${backup.title}”.`, "info");
  }
  window.openWorldbuildingLayout = () => {
    const pageId = getCurrentPageId();
    const page = userPages.find(entry => entry.id === pageId);
    if (page?.layout !== "board-canvas") { showAppToast("Open a regular board page first.","info"); return; }
    const blocks = getPageBlocks(pageId);
    const refining = blocks.some(block => block.type === "mood-board") && blocks.some(block => block.type === "page-tags") && blocks.some(block => /World Compendium/.test(block.bodyHTML || ""));
    const dialog = document.createElement("dialog");
    dialog.className = "dashboard-dialog";
    dialog.innerHTML = `<h2>${refining ? "Refine" : "Apply"} worldbuilding layout</h2><p>Arrange <strong>${esc(page.title)}</strong> using editable blocks, with a gothic banner and individual illustrations. Existing category links, goals, reminders and tags are reused. A named copy of the current layout is saved beside this page first.</p><div class="dashboard-layout-sections"><span>On My Desk</span><span>Quick Links · Recent Pages</span><span class="wide">Story & Writing · three illustrated cards</span><span class="wide">World Compendium · nine linked categories</span><span>Project Mood → Infinite Board</span><span>Quick-add page tags</span></div><p>Find Pages opens search; Mood Board opens the connected Infinite Board. Category pages are kept; additional content is retained below the layout.</p><div class="dashboard-tool-choices"><button data-apply>${refining ? "Refine this page" : "Apply to this page"}</button><button data-cancel>Cancel</button></div><p role="status"></p>`;
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector("[data-cancel]").onclick = () => { dialog.close(); dialog.remove(); };
    dialog.querySelector("[data-apply]").onclick = async event => {
      event.currentTarget.disabled = true;
      try { await applyWorldbuildingLayout(pageId); dialog.close(); dialog.remove(); }
      catch(error) { dialog.querySelector('[role="status"]').textContent = error.message; event.currentTarget.disabled = false; }
    };
    dialog.addEventListener("close",()=>dialog.remove());
  };
})();
