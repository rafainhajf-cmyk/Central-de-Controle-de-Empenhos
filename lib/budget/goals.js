'use strict';
const {cents,safeNumber,ratioBasisPoints,fail}=require('./primitives');
function goalProgress(goal,basis){
 const unavailable=reason=>({available:false,reason,gapCents:null,completionBasisPoints:null});
 if(!basis||basis.confirmed!==true)return unavailable('Base financeira sem confirmação.');
 if(goal.measure!==basis.measure)return unavailable('Bases de liquidação incompatíveis; exige conciliação.');
 if(!['percentage','liquidated-value','remaining-limit'].includes(goal.kind))fail('Modalidade de meta inválida.');
 const required=goal.kind==='percentage'?['receivedCents','liquidatedCents']:goal.kind==='remaining-limit'?['remainingCents']:['liquidatedCents'];
 if(required.some(k=>basis[k]===undefined||basis[k]===null))return unavailable('Base financeira incompleta.');
 required.forEach(k=>cents(basis[k]));let target,gap,achieved,denominator;
 if(goal.kind==='percentage'){
  if(!Number.isInteger(goal.targetBasisPoints)||goal.targetBasisPoints<0||goal.targetBasisPoints>10000)fail('Percentual da meta inválido.');
  target=safeNumber((BigInt(basis.receivedCents)*BigInt(goal.targetBasisPoints)+9999n)/10000n);gap=Math.max(0,target-basis.liquidatedCents);achieved=basis.liquidatedCents;denominator=target;
 }else if(goal.kind==='liquidated-value'){target=cents(goal.targetCents);gap=Math.max(0,target-basis.liquidatedCents);achieved=basis.liquidatedCents;denominator=target;}
 else{target=cents(goal.targetCents);gap=Math.max(0,basis.remainingCents-target);achieved=null;denominator=null;}
 return {available:true,kind:goal.kind,targetCents:target,gapCents:gap,completionBasisPoints:denominator===null?null:ratioBasisPoints(achieved,denominator),met:gap===0,sourceDate:basis.date||null,measure:basis.measure,calculation:goal.kind==='remaining-limit'?'max(0, saldo atual − limite de saldo)':goal.kind==='percentage'?'max(0, teto em centavos(base × percentual) − liquidado confirmado)':'max(0, valor alvo − liquidado confirmado)'};
}
function executionProgress(record){
 const original=cents(record.originalCents),reinforced=cents(record.reinforcedCents??0),cancelled=cents(record.cancelledCents??0),liquidated=cents(record.liquidatedCents,{nullable:true});
 const current=safeNumber(BigInt(original)+BigInt(reinforced)-BigInt(cancelled));if(current<0)fail('Anulação superior ao valor vigente.');
 return {currentCommitmentCents:current,liquidatedCents:liquidated,liquidatedBasisPoints:liquidated===null?null:ratioBasisPoints(liquidated,current),remainingCents:liquidated===null?null:Math.max(0,current-liquidated),issues:liquidated>current?['LIQUIDATED_EXCEEDS_COMMITMENT']:[]};
}
function sectorContribution(sector,basis){
 const own=sector.ownGoal?goalProgress(sector.ownGoal,sector.basis):null;
 if(!basis?.confirmed||!sector.basis?.confirmed||basis.measure!==sector.basis.measure||basis.date!==sector.basis.date)return {available:false,reason:'Bases de setor e meta não conciliadas.',participationBasisPoints:null,ownGoal:own};
 if(basis.receivedCents==null||sector.basis.receivedCents==null)return {available:false,reason:'Participação sem base compatível.',participationBasisPoints:null,ownGoal:own};
 return {available:true,participationBasisPoints:ratioBasisPoints(sector.basis.receivedCents,basis.receivedCents),ownGoal:own};
}
function liquidationCandidates(records){return records.filter(r=>Number.isSafeInteger(r.remainingCents)&&r.remainingCents>0).map(r=>({...r,readyToLiquidate:r.supplyConfirmed===true&&r.documentationConfirmed===true&&r.identityConfirmed===true,potentialCents:r.remainingCents}));}
module.exports={goalProgress,executionProgress,sectorContribution,liquidationCandidates};
