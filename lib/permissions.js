'use strict';
const ROLES=['admin','manager','sector-lead','operator'];
function can(identity,action,record={}){
 if(!identity?.userId||identity.active!==true||!ROLES.includes(identity.role))return false;
 if(action==='manage-users'||action==='calendar')return identity.role==='admin';
 if(!['read','respond','assign','generate','create'].includes(action))return false;
 if(['admin','manager'].includes(identity.role))return true;
 const inSector=typeof record.sector==='string'&&identity.sectors?.includes(record.sector);
 if(action==='assign'||action==='generate'||action==='create')return identity.role==='sector-lead'&&inSector;
 if(identity.role==='sector-lead')return inSector;
 return record.assigneeId===identity.userId||(!record.assigneeId&&inSector);
}
// This predicate is also used in SQL; parameters are never interpolated as SQL.
function scope(identity,alias='a',start=1){
 if(!identity?.userId||identity.active!==true||!ROLES.includes(identity.role)||!Array.isArray(identity.sectors))return {sql:'FALSE',params:[]};
 if(['admin','manager'].includes(identity.role)&&identity.active===true)return {sql:'TRUE',params:[]};
 if(!['a','e'].includes(alias))throw Error('Invalid SQL alias');
 if(identity.role==='sector-lead')return {sql:`${alias}.sector = ANY($${start}::text[])`,params:[identity.sectors]};
 return {sql:`(${alias}.assignee_id = $${start} OR (${alias}.assignee_id IS NULL AND ${alias}.sector = ANY($${start+1}::text[])))`,params:[identity.userId,identity.sectors]};
}
module.exports={ROLES,can,scope};
