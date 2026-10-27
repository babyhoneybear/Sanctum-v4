// Download the public-domain stock illustrations used by the worldbuilding preset.
const fs = require('node:fs/promises');
const path = require('node:path');
const assets = [
['red-roses','dark-crimson-roses_1330845_754693','7/3/2/732c1033-5117-43ed-ba91-f673f9d49cbe','dark-crimson-roses'],
['characters','antique-book-display_139029_17130','7/6/0/760dce5c-a60d-4f26-a064-5ec6ae5b2693','antique-book-display'],
['trade','historic-harbor-scene_354157_368098','9/4/f/94fe6a73-9bbc-42dd-a4fd-a6ef84df6787','historic-harbor-scene'],
['castle','gothic-castle-vista_1659437_1199953','4/b/1/4b187308-7309-4b88-81c4-89a1297f5ef3','gothic-castle-vista'],
['desk','candlelit-writing-desk_959751_973416','1/c/6/1c6ac6ab-0e99-4b95-81ae-ce57fa8ab8dc','candlelit-writing-desk'],
['hero','misty-castle-spires_1746693_1219887','6/a/0/6a0e1b6b-cef6-4c93-8387-a1e6b0e71c90','misty-castle-spires'],
['nature','wolf-in-forest_1393046_73182','6/e/b/6eb762ad-22c6-4c7c-a38a-313b2ad3ba62','wolf-in-forest'],
['culture','medieval-banquet-hall_1161685_1064108','2/4/c/24c53842-95a8-4fb8-b5a5-18af0366bc40','medieval-banquet-hall'],
['white-roses','ethereal-white-roses_2457223_1446116','1/9/b/19be0ae5-1a80-49cf-b29e-67f6b2ed0d0c','ethereal-white-roses'],
['military','medieval-knight-s-armor_3227681_1488023','9/b/6/9b634ca2-b4f8-4c98-8cb7-eabac17832ad','medieval-knight-s-armor'],
['history','ancient-arches-endure_1842545_1250827','c/2/b/c2be2778-105c-4a7e-9c66-2c81a3b3319f','ancient-arches-endure'],
['magic','moonlit-forest-night_789822_456959','2/7/a/27ab14df-ee34-4479-b979-034b6dce52e6','moonlit-forest-night'],
['faith','candlelit-cathedral-interior_574272_675547','d/5/d/d5db5905-b371-47ee-a07e-8961aeb76fdb','candlelit-cathedral-interior'],
['scenes','sealing-wax-letter_877825_954294','1/b/c/1bc4312e-4d76-44cc-b0fb-bc3851e8b62a','sealing-wax-letter'],
['factions','banni%C3%A8res-h%C3%A9raldiques-m%C3%A9di%C3%A9vales_4691875_2013357/','6/e/7/6e7ab831-6b63-4135-9e15-0e3465af0175','medieval-heraldic-banners'],
];
async function main() {
 const out = path.resolve(__dirname,'../assets/worldbuilding');
 await fs.mkdir(out,{recursive:true});
 await Promise.all(assets.map(async ([name,source,id,slug])=>{
  const response=await fetch(`https://images.stockcake.com/public/${id}_large/${slug}-stockcake.jpg`);
  if(!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error(`${name}: ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  await fs.writeFile(path.join(out,`${name}.jpg`),bytes);
  console.log(`${name}: ${bytes.length} bytes`);
 }));
 await fs.writeFile(path.join(out,'CREDITS.md'),'# Worldbuilding artwork\n\nExisting AI-generated stock illustrations from StockCake, downloaded September 19, 2026. Public domain / CC0 under https://stockcake.com/info/license . No paid or HD assets used.\n\n'+assets.map(([name,source])=>`- ${name}.jpg: https://stockcake.com/i/${source}`).join('\n')+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
