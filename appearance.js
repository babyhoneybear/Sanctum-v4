// Reusable appearance settings. Defaults add no overrides to the normal editor.
(function (root) {
  const numeric = (value, fallback, min, max) => value === '' || value == null || !Number.isFinite(Number(value)) ? fallback : Math.max(min, Math.min(max, Number(value)));
  const source = value => {
    const raw = typeof value === 'string' ? value.trim() : '';
    return /^(https?:\/\/|data:image\/|assets\/|\.\.?\/|\/(?!\/))/i.test(raw) && !/[\r\n]/.test(raw) ? raw : '';
  };
  function normalizeAppearance(raw = {}) {
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = {}; } }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    const number = (key, fallback, min, max) => numeric(raw[key], fallback, min, max);
    const color = (key, fallback = '') => /^#[0-9a-f]{6}$/i.test(raw[key] || '') ? raw[key] : fallback;
    return {
      brightness:number('brightness',100,0,200), saturation:number('saturation',100,0,200),
      overlaySource:source(raw.overlaySource), overlayOpacity:number('overlayOpacity',65,0,100), overlayWidth:number('overlayWidth',35,5,100),
      overlaySide:raw.overlaySide === 'right' ? 'right' : 'left', overlayFade:raw.overlayFade !== false,
      gradient:['none','left','right','down'].includes(raw.gradient) ? raw.gradient : 'none', gradientColor:color('gradientColor','#080909'), gradientOpacity:number('gradientOpacity',80,0,100),
      fontSize:number('fontSize',0,0,96), titleSize:number('titleSize',0,0,120), subtitleSize:number('subtitleSize',0,0,60),
      fontWeight:number('fontWeight',0,0,900), lineHeight:number('lineHeight',0,0,3), letterSpacing:number('letterSpacing',0,-2,12),
      italic:raw.italic === true, shadow:raw.shadow === true, headingRule:raw.headingRule === true,
      textAlign:['left','center','right'].includes(raw.textAlign) ? raw.textAlign : '',
      rowGap:number('rowGap',-1,-1,40), rowHeight:number('rowHeight',0,0,96),
      height:number('height',0,0,720), insetX:number('insetX',0,0,240), insetBottom:number('insetBottom',0,0,240),
      titleColor:color('titleColor'), subtitleColor:color('subtitleColor')
    };
  }
  // Compatibility only: the old preset's effects become saved, editable settings.
  // No CSS depends on a dashboard role after this conversion.
  function legacyBlockAppearance(role = '') {
    const values = {fontSize:17};
    if (!role) return normalizeAppearance();
    if (role === 'heading') Object.assign(values,{titleSize:30,fontWeight:400,lineHeight:1.2,headingRule:true,letterSpacing:.6});
    if (role === 'desk-quote') Object.assign(values,{fontSize:26,italic:true,lineHeight:1.45,textAlign:'center',shadow:true});
    if (role === 'image') Object.assign(values,{brightness:74,saturation:58});
    if (role === 'footer-art') Object.assign(values,{brightness:65,saturation:60,overlaySource:'assets/worldbuilding/red-roses.jpg',overlayWidth:45,overlayOpacity:80});
    if (role.startsWith('card-')) Object.assign(values,{brightness:80,saturation:55,titleSize:21,subtitleSize:15});
    if (['flower-quote','rose-quote','footer-quote'].includes(role)) Object.assign(values,{shadow:true,gradient:role === 'footer-quote' ? 'right' : 'left'});
    if (role === 'recent') Object.assign(values,{fontSize:16,titleSize:21,subtitleSize:15,rowGap:0,rowHeight:25});
    if (role === 'current') Object.assign(values,{fontSize:16,fontWeight:400,lineHeight:1});
    if (role === 'mood-board') Object.assign(values,{fontSize:16,brightness:85,saturation:65});
    if (role === 'page-tags') values.fontSize = 16;
    return normalizeAppearance(values);
  }
  function getSavedBlockAppearance(data = {}) {
    return data.appearance == null ? legacyBlockAppearance(data.dashboardRole) : normalizeAppearance(data.appearance);
  }
  const legacyBanner = () => normalizeAppearance({brightness:80,saturation:55,overlaySource:'assets/worldbuilding/white-roses.jpg',overlayWidth:32,overlayOpacity:65,titleSize:76,subtitleSize:20,height:336,insetX:120,insetBottom:38,titleColor:'#eee4d5',subtitleColor:'#ddd4c7',fontWeight:500});
  root.normalizeAppearance = normalizeAppearance;
  root.getSavedBlockAppearance = getSavedBlockAppearance;
  if (typeof module !== 'undefined' && module.exports) module.exports = {normalizeAppearance,legacyBlockAppearance,getSavedBlockAppearance};
  if (typeof document === 'undefined') return;
  const escape = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const cssURL = url => `url("${url.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}")`;
  function applyAppearance(target, raw) {
    if (!target) return;
    const cfg = normalizeAppearance(raw);
    target.classList.add('appearance-target');
    const values = {
      brightness:cfg.brightness+'%', saturation:cfg.saturation+'%',
      'overlay-image':cfg.overlaySource ? cssURL(cfg.overlaySource) : 'none',
      'overlay-opacity':cfg.overlayOpacity/100, 'overlay-width':cfg.overlayWidth+'%',
      'overlay-left':cfg.overlaySide === 'left' ? '0' : 'auto', 'overlay-right':cfg.overlaySide === 'right' ? '0' : 'auto',
      'overlay-mask':cfg.overlayFade ? `linear-gradient(to ${cfg.overlaySide === 'left' ? 'right' : 'left'},#000,transparent)` : 'none',
      'gradient-image':cfg.gradient === 'none' ? 'none' : `linear-gradient(to ${{left:'right',right:'left',down:'bottom'}[cfg.gradient]},${cfg.gradientColor}${Math.round(cfg.gradientOpacity*2.55).toString(16).padStart(2,'0')},transparent)`
    };
    for (const [key,value] of Object.entries(values)) target.style.setProperty('--appearance-'+key,String(value));
    for (const key of ['fontSize','titleSize','subtitleSize','fontWeight','lineHeight','letterSpacing','textAlign','rowGap','rowHeight','titleColor','subtitleColor']) {
      const name = key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
      const active = key === 'rowGap' ? cfg[key] >= 0 : !!cfg[key];
      target.toggleAttribute('data-appearance-'+name,active);
      target.style.removeProperty('--appearance-'+name);
      if (active) target.style.setProperty('--appearance-'+name, String(cfg[key])+(['fontSize','titleSize','subtitleSize','letterSpacing','rowGap','rowHeight'].includes(key)?'px':''));
    }
    for (const key of ['italic','shadow','headingRule']) target.toggleAttribute('data-appearance-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),cfg[key]);
    target.toggleAttribute('data-appearance-gradient',cfg.gradient !== 'none');
    target.toggleAttribute('data-appearance-overlay',!!cfg.overlaySource);
  }
  function applyBlockAppearance(block, raw, persist = true) {
    const cfg = normalizeAppearance(raw);
    if (persist) block.dataset.appearance = JSON.stringify(cfg);
    applyAppearance(block,cfg);
  }
  function bannerConfig(pageId, settings) {
    if (settings.bannerAppearance != null) return normalizeAppearance(settings.bannerAppearance);
    const hasOldLayout = typeof getPageBlocks === 'function' && getPageBlocks(pageId).some(b=>b.dashboardRole);
    // Restore the ordinary size buttons immediately for a legacy preset.
    const cfg = hasOldLayout ? legacyBanner() : normalizeAppearance();
    if (settings.headerSize !== 'xl') cfg.height = 0;
    return cfg;
  }
  function applyBannerAppearance(raw) {
    const target = document.getElementById('pageHeroImgWrap');
    if (!target) return;
    const cfg = normalizeAppearance(raw);
    applyAppearance(target,cfg);
    target.style.height = cfg.height ? cfg.height+'px' : '';
    for (const [key,name] of [['insetX','--appearance-inset-x'],['insetBottom','--appearance-inset-bottom']]) {
      if (cfg[key]) target.style.setProperty(name,cfg[key]+'px'); else target.style.removeProperty(name);
    }
  }
  root.applyBlockAppearance = applyBlockAppearance;
  root.renderBannerAppearance = (pageId,settings) => applyBannerAppearance(bannerConfig(pageId,settings));

  function openEditor(block = null) {
    const banner = !block;
    const pageId = getCurrentPageId();
    const originalSettings = banner ? getPageSettings(pageId) : null;
    const original = banner ? bannerConfig(pageId,originalSettings) : normalizeAppearance(block.dataset.appearance);
    let draft = {...original}, committed = false, useThemeColors = false, busy = false, saving = false;
    const dialog = document.createElement('dialog');
    dialog.className = 'appearance-dialog';
    dialog.setAttribute('aria-label',banner ? 'Banner appearance' : 'Block appearance');
    const numericField = (label,key,min,max,step=1) => `<label>${label}<input name="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${draft[key]}"></label>`;
    const select = (label,key,options) => `<label>${label}<select name="${key}">${options.map(([value,label])=>`<option value="${value}"${draft[key]===value?' selected':''}>${label}</option>`).join('')}</select></label>`;
    const check = (label,key) => `<label class="appearance-check"><input type="checkbox" name="${key}"${draft[key]?' checked':''}>${label}</label>`;
    const color = (label,key) => `<label>${label}<input type="text" name="${key}" placeholder="Default" value="${escape(draft[key])}" pattern="#[0-9a-fA-F]{6}|" maxlength="7"></label>`;
    dialog.innerHTML = `<form><h2>${banner?'Banner':'Block'} appearance</h2><p>Preview changes here, then Save. Reset effects returns to the ordinary editor styling.</p>
      <fieldset><legend>Image</legend><div class="appearance-fields">${numericField('Brightness (%)','brightness',0,200)}${numericField('Saturation (%)','saturation',0,200)}</div></fieldset>
      <fieldset><legend>Decorative image overlay</legend><div class="appearance-fields">
      <label class="appearance-wide">Image URL or local asset path<input name="overlaySource" type="text" value="${escape(draft.overlaySource)}" placeholder="https://… or assets/…"></label>
      <div class="appearance-wide appearance-actions"><button type="button" data-upload>Upload image…</button><button type="button" data-overlay="white">White roses</button><button type="button" data-overlay="red">Red roses</button><button type="button" data-overlay="none">Remove overlay</button><input type="file" accept="image/*" data-file hidden></div>
      ${select('Position','overlaySide',[['left','Left'],['right','Right']])}${numericField('Width (%)','overlayWidth',5,100)}${numericField('Opacity (%)','overlayOpacity',0,100)}${check('Fade into image','overlayFade')}</div></fieldset>
      <fieldset><legend>Background fade</legend><div class="appearance-fields">${select('Direction','gradient',[['none','None'],['left','Color on left'],['right','Color on right'],['down','Color at top']])}${color('Fade color','gradientColor')}${numericField('Fade opacity (%)','gradientOpacity',0,100)}</div></fieldset>
      <fieldset><legend>Typography</legend><p>Size 0 uses the normal size. Existing inline text formatting is preserved.</p><div class="appearance-fields">
      ${!banner ? numericField('Text size (px)','fontSize',0,96) : ''}${numericField('Title / heading size (px)','titleSize',0,120)}${numericField('Subtitle size (px)','subtitleSize',0,60)}${numericField('Weight (0 = default)','fontWeight',0,900,100)}${numericField('Line height (0 = default)','lineHeight',0,3,.05)}${numericField('Letter spacing (px)','letterSpacing',-2,12,.1)}${select('Alignment','textAlign',[['','Default'],['left','Left'],['center','Center'],['right','Right']])}${check('Italic','italic')}${check('Text shadow','shadow')}${!banner ? check('Heading divider line','headingRule') : color('Title color','titleColor')+color('Subtitle color','subtitleColor')}
      </div></fieldset>
      <fieldset><legend>Spacing</legend><div class="appearance-fields">${banner ? numericField('Custom banner height (0 = size buttons)','height',0,720)+numericField('Title side inset (0 = default)','insetX',0,240)+numericField('Title bottom inset (0 = default)','insetBottom',0,240) : numericField('List gap (-1 = default)','rowGap',-1,40)+numericField('List row height (0 = default)','rowHeight',0,96)}</div></fieldset>
      ${!banner?'<p>Solid colors, borders and padding use the existing toolbar controls.</p><label class="appearance-check"><input type="checkbox" data-theme-colors>Clear custom block colors and use the page theme</label>':''}
      <p role="status" aria-live="polite"></p><footer><button type="button" data-reset>Reset effects</button><span></span><button type="button" data-cancel>Cancel</button><button type="submit">Save</button></footer></form>`;
    const preview = () => banner ? applyBannerAppearance(draft) : applyBlockAppearance(block,draft,false);
    const syncInputs = () => dialog.querySelectorAll('[name]').forEach(input=>{ if(input.type==='checkbox') input.checked=draft[input.name]; else input.value=draft[input.name]; });
    const restore = () => banner ? applyBannerAppearance(original) : applyBlockAppearance(block,original,false);
    dialog.addEventListener('input',event=>{
      const input = event.target;
      if (!input.name) return;
      draft = normalizeAppearance({...draft,[input.name]:input.type==='checkbox'?input.checked:input.value});
      preview();
    });
    dialog.querySelector('[data-theme-colors]')?.addEventListener('change',e=>{useThemeColors=e.target.checked;});
    dialog.querySelector('[data-reset]').onclick = () => {draft=normalizeAppearance();syncInputs();preview();};
    dialog.querySelectorAll('[data-overlay]').forEach(button=>button.onclick=()=>{
      draft.overlaySource=button.dataset.overlay==='none'?'':`assets/worldbuilding/${button.dataset.overlay}-roses.jpg`;
      syncInputs();preview();
    });
    const fileInput = dialog.querySelector('[data-file]');
    dialog.querySelector('[data-upload]').onclick=()=>fileInput.click();
    fileInput.onchange=async()=>{
      const file=fileInput.files?.[0]; if(!file)return;
      const status=dialog.querySelector('[role="status"]');
      if(!file.type.startsWith('image/')){status.textContent='Choose an image file.';return;}
      busy=true;dialog.querySelector('[type="submit"]').disabled=true;
      try { const src=await prepareImageFileForStorage(file);if(!dialog.isConnected)return;draft.overlaySource=src;syncInputs();preview();status.textContent='Image ready. Save to keep it.'; }
      catch(error){status.textContent=error.message;}
      finally{busy=false;dialog.querySelector('[type="submit"]').disabled=false;}
    };
    dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
    dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
    dialog.addEventListener('close',()=>{if(!committed)restore();dialog.remove();});
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault(); if(busy)return;
      const status=dialog.querySelector('[role="status"]');
      if(pageId!==getCurrentPageId() || (!banner&&!block.isConnected)){status.textContent='The page changed. Close this editor and try again.';return;}
      const oldBlock = !banner ? {bg:block.style.backgroundColor,borderColor:block.style.borderColor,textColor:block.style.color,titleColor:block.dataset.titleColor,height:block.style.height} : null;
      const oldAppearance = !banner ? block.dataset.appearance : null;
      busy=true;saving=true;
      dialog.querySelector('[type="submit"]').disabled=true;
      dialog.querySelector('[data-cancel]').disabled=true;
      try {
        if(banner) {
          if(!savePageSettings(pageId,{...getPageSettings(pageId),bannerAppearance:draft})) throw Error('Could not save banner appearance.');
        } else {
          applyBlockAppearance(block,draft);
          if(useThemeColors){applyBlockBackgroundTone(block,'');applyBlockBorderTone(block,'');applyBlockTextTone(block,'');applyBlockTitleTone(block,'');}
          if(typeof autoGrowBlock==='function' && ['text','data-callout'].includes(block.dataset.type)) autoGrowBlock(block,{allowShrink:false});
          if(!saveState(false)) throw Error('Could not save block appearance.');
        }
        if(await window.SanctumStorage?.flush()===false) throw Error('Could not finish saving. Your previous appearance was restored.');
        if(!banner) pushHistory();
        committed=true;dialog.close();
      } catch(error) {
        if(banner) savePageSettings(pageId,originalSettings);
        else {
          block.dataset.appearance=oldAppearance || JSON.stringify(original);
          if(useThemeColors){applyBlockBackgroundTone(block,oldBlock.bg);applyBlockBorderTone(block,oldBlock.borderColor);applyBlockTextTone(block,oldBlock.textColor);applyBlockTitleTone(block,oldBlock.titleColor);}
          block.style.height=oldBlock.height; saveState(false);
        }
        restore();status.textContent=error.message;
      } finally {
        busy=false;saving=false;
        dialog.querySelector('[type="submit"]').disabled=false;
        dialog.querySelector('[data-cancel]').disabled=false;
      }
    };
    document.body.appendChild(dialog);dialog.showModal();
  }
  root.openBannerAppearance=()=>openEditor();
  document.getElementById('bannerAppearanceBtn')?.addEventListener('click',event=>{event.stopPropagation();openEditor();});
  document.getElementById('blockAppearanceBtn')?.addEventListener('click',()=>{
    if(typeof selectedBlock!=='undefined' && selectedBlock) openEditor(selectedBlock);
    else showAppToast('Select a block first.','info');
  });
})(typeof window !== 'undefined' ? window : globalThis);
