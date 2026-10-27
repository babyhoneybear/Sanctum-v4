(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SanctumWritingCheckData = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MAX_TEXT = 200000;
  const CHUNK_TEXT = 18000;
  function chunks(text) {
    const result = [];
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(text.length,offset+CHUNK_TEXT);
      if (end < text.length) {
        const newline = text.lastIndexOf('\n',end);
        const space = text.lastIndexOf(' ',end);
        const sentenceEnds = [...text.slice(offset,end).matchAll(/[.!?]["'”’)]*\s+/g)].map(match => offset+match.index+match[0].length);
        const sentenceEnd = sentenceEnds.at(-1) || offset;
        if (newline > offset+CHUNK_TEXT/2) end = newline+1;
        else if (sentenceEnd > offset+CHUNK_TEXT/2) end = sentenceEnd;
        else if (space > offset+CHUNK_TEXT*.7) end = space+1;
        else if (/^[\uDC00-\uDFFF]$/.test(text[end])) end--;
      }
      const startsSentence = offset === 0 || /(?:[.!?]["'”’)]*|\n)\s*$/.test(text.slice(Math.max(0,offset-50),offset));
      result.push({offset,text:text.slice(offset,end),startsSentence}); offset=end;
    }
    return result;
  }
  const canonical = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('en-US').replace(/[’]/g, "'");
  function settings(raw = {}) {
    return {live:raw?.live !== false, language:['en-US','en-GB','en-CA','en-AU'].includes(raw?.language) ? raw.language : 'en-US'};
  }
  function words(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.filter(word => typeof word === 'string').map(word => word.normalize('NFC').trim())
      .filter(word => word && word.length <= 120 && /\p{L}/u.test(word) && !/[\r\n\x00-\x1f]/.test(word))
      .filter(word => { const key = canonical(word); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 5000);
  }
  function distance(left, right, limit = 2) {
    if (Math.abs(left.length - right.length) > limit) return limit + 1;
    let previous = Array.from({length:right.length + 1}, (_, i) => i), before = previous;
    for (let i = 1; i <= left.length; i++) {
      const next = [i];
      for (let j = 1; j <= right.length; j++) {
        next[j] = Math.min(next[j-1]+1, previous[j]+1, previous[j-1]+(left[i-1] === right[j-1] ? 0 : 1));
        if (i > 1 && j > 1 && left[i-1] === right[j-2] && left[i-2] === right[j-1]) next[j] = Math.min(next[j], before[j-2]+1);
      }
      before = previous; previous = next;
    }
    return previous[right.length];
  }
  function matches(text, rawMatches, rawWords = []) {
    const dictionary = words(rawWords), accepted = new Set(dictionary.map(canonical));
    const acceptedPhrases = dictionary.filter(word => /\s/.test(word)).flatMap(word => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/['’]/g,"['’]").replace(/\s+/g,'\\s+');
      return [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'giu'))].map(match => ({start:match.index,end:match.index+match[0].length}));
    });
    return (Array.isArray(rawMatches) ? rawMatches : []).filter(match => Number.isInteger(match.offset) && Number.isInteger(match.length)
      && match.offset >= 0 && match.length >= 0 && match.offset + match.length <= text.length).map(match => {
        const original = text.slice(match.offset, match.offset + match.length);
        const spelling = match.rule?.issueType === 'misspelling';
        if (spelling && (accepted.has(canonical(original)) || acceptedPhrases.some(phrase => match.offset>=phrase.start && match.offset+match.length<=phrase.end))) return null;
        const extra = spelling && original.length >= 3 ? dictionary.map(word => ({word, score:distance(canonical(original),canonical(word))}))
          .filter(item => item.score <= (original.length < 5 ? 1 : 2)).sort((a,b) => a.score - b.score).slice(0, 3).map(item => item.word) : [];
        const replacements = [...new Set([...extra, ...(match.replacements || []).map(item => item.value).filter(value => typeof value === 'string')])].slice(0, 6);
        return {offset:match.offset, length:match.length, original, message:String(match.message || 'Check this text.'),
          spelling, ruleId:String(match.rule?.id || ''), replacements};
      }).filter(Boolean).slice(0, 300);
  }
  function replace(text, match, replacement) {
    if (typeof replacement !== 'string' || text.slice(match.offset,match.offset+match.length) !== match.original) throw new Error('The text changed. Check it again before applying this correction.');
    return text.slice(0,match.offset) + replacement + text.slice(match.offset+match.length);
  }
  function context(text,match) {
    // A bounded window retains the exact selected occurrence and UTF-16 offsets.
    let start=Math.max(0,match.offset-500),end=Math.min(text.length,match.offset+match.length+500);
    while(start>0&&start<match.offset&&/[\p{L}\p{M}\p{N}]/u.test(text[start-1]))start++;
    while(end<text.length&&end>match.offset+match.length&&/[\p{L}\p{M}\p{N}]/u.test(text[end]))end--;
    if(/[\uDC00-\uDFFF]/.test(text[start]||'')&&/[\uD800-\uDBFF]/.test(text[start-1]||''))start++;
    if(/[\uD800-\uDBFF]/.test(text[end-1]||'')&&/[\uDC00-\uDFFF]/.test(text[end]||''))end--;
    return {word:match.original,text:text.slice(start,end),offset:match.offset-start};
  }
  return { MAX_TEXT, chunks, canonical, settings, words, distance, matches, replace, context };
});
