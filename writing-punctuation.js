// Conservative additions to the local engine. These are suggestions, never automatic edits.
const subject = /^(?:i|you|we|he|she|it|they)$/i;
const finite = /^(?:am|is|are|was|were|have|has|had|do|does|did|can|could|will|would|should|must|may|might|shall|went|go|goes|left|leave|leaves|stay|stays|stayed|arrive|arrives|arrived|return|returns|returned|walk|walks|walked|run|runs|ran|sleep|sleeps|slept|work|works|worked|need|needs|needed|want|wants|wanted|rain|rains|rained|eat|eats|ate|feel|feels|felt|see|sees|saw|get|gets|got|come|comes|came|look|looks|looked)$/i;
const embedded = /\b(?:think|thinks|thought|know|knows|knew|believe|believes|believed|hope|hopes|hoped|say|says|said|tell|tells|told|wonder|wonders|wondered|ensure|ensures|decide|decides|decided|wish|wishes|expect|expects|expected|mean|means|meant)\b/i;
const contraction = /^(?:i|you|we|he|she|it|they)['’](?:m|re|s|ve|ll|d)$/i;
function clause(tokens) {
  if(tokens.length<2)return false;
  if(contraction.test(tokens[0].word))return true;
  if(!subject.test(tokens[0].word)||!finite.test(tokens[1].word))return false;
  return tokens.length>=3 || !/^(?:am|is|are|was|were|have|has|had|do|does|did|can|could|will|would|should|must|may|might|shall)$/i.test(tokens[1].word);
}
function tokens(text,offset=0) {return [...text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)].map(match=>({word:match[0],start:offset+match.index,end:offset+match.index+match[0].length}));}
function rule(id,offset,length,message,replacements) {return {offset,length,message,replacements:replacements.map(value=>({value})),rule:{id,issueType:'typographical',category:{id:'PUNCTUATION',name:'Punctuation'}}};}
function punctuation(text) {
  const matches=[];
  for(const sentence of text.matchAll(/[^.!?\n]+[.!?]?/g)){
    const body=sentence[0],base=sentence.index;
    // Quotes, parenthetical clauses and semicolons need more context than these rules have.
    if(body.length>240 || /["“”()\[\];:]/.test(body))continue;
    const intro=/^\s*(?:if|when|although|because|unless|while|after|before|once|even though|as soon as)\s+/i.exec(body);
    if(intro && !body.includes(',')){
      const words=tokens(body.slice(intro[0].length),base+intro[0].length);
      for(let i=2;i<words.length-1;i++){
        if(!clause(words.slice(i)))continue;
        const before=body.slice(intro[0].length,words[i].start-base);
        if(!clause(words.slice(0,i)) || embedded.test(before) || /\b(?:and|or|but|nor|that|whether|if|because|while)\b/i.test(before))continue;
        const previous=words[i-1];
        if(!/^[ \t]+$/.test(text.slice(previous.end,words[i].start)))continue;
        matches.push(rule('SANCTUM_INTRO_CLAUSE_COMMA',previous.start,words[i].end-previous.start,'Consider a comma between the introductory clause and the main sentence.',[text.slice(previous.start,previous.end)+', '+words[i].word]));
        break;
      }
    }
    // Only two simple pronoun-led clauses; avoid dialogue, enumerations and repeated refrains.
    if((body.match(/,/g)||[]).length===1 && !intro){
      const comma=body.indexOf(','),left=tokens(body.slice(0,comma),base),right=tokens(body.slice(comma+1),base+comma+1);
      if(!clause(left)||!clause(right)||/\b(?:said|asked|replied|whispered|shouted|called|added|answered)\b/i.test(body) || left.map(t=>t.word.toLowerCase()).join(' ')===right.map(t=>t.word.toLowerCase()).join(' '))continue;
      if(/\b(?:if|when|although|because|unless|while|before|after|that|which|who)\b/i.test(body.slice(0,comma)))continue;
      const last=left.at(-1),first=right[0],prefix=text.slice(last.start,last.end);
      if(!/^\s*$/.test(body.slice(last.end-base,comma))||!/^\s*$/.test(body.slice(comma+1,first.start-base)))continue;
      matches.push(rule('SANCTUM_POSSIBLE_COMMA_SPLICE',last.start,first.end-last.start,'These look like two complete sentences. Consider a semicolon or a period.',[prefix+'; '+first.word,prefix+'. '+first.word[0].toUpperCase()+first.word.slice(1)]));
    }
  }
  return matches;
}
function merge(text,engineMatches) {
  const additions=punctuation(text).filter(extra=>!engineMatches.some(match=>extra.offset<match.offset+Math.max(1,match.length)&&match.offset<extra.offset+extra.length));
  return [...engineMatches,...additions].sort((a,b)=>a.offset-b.offset);
}
module.exports={punctuation,merge};
