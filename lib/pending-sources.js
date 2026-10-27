'use strict';
// A origem é mantida na providência para evitar um segundo cadastro de distribuição.
function distributionPending(distributions) {
  if (!distributions || !Array.isArray(distributions.rows)) throw Error('Distribuições indisponíveis');
  return distributions.rows.filter(r => r && Number.isSafeInteger(r.row) && r.row >= 0 && r.nc).map(r => {
    return {sourceType:'distribution',sourceRow:r.row,sourceReference:String(r.nc),description:r.issue || (r.phase==='receipt'?'Conferir encerramento da distribuição':'Acompanhar empenho da distribuição'),sector:r.sector||'',responsible:r.responsible||'',daysPending:Number.isSafeInteger(r.days)?r.days:null,issue:r.dateIssue||r.issue||'',note:r.note||''};
  });
}
module.exports={distributionPending};
