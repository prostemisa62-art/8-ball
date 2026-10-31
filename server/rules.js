'use strict';
/**
 * Pravidla 8-ball – čistá funkce bez vedlejších efektů.
 * Vstup popisuje stav před úderem a to, co se při úderu stalo.
 */
const { groupOf } = require('./physics');

const other = (g) => (g === 'solid' ? 'stripe' : 'solid');
const countGroup = (g, onTable) => onTable.filter((id) => groupOf(id) === g).length;

function evaluateShot({ me, groups, onTable, isBreak, firstContact, pocketed, railAfter }) {
  const opp = 1 - me;
  const myGroup = groups[me];
  const newGroups = groups.slice();
  const fouls = [];

  const cueScratched = pocketed.includes(0);
  const eightPocketed = pocketed.includes(8);
  const objPocketed = pocketed.filter((id) => id !== 0 && id !== 8);
  const shootingEight = !!myGroup && countGroup(myGroup, onTable) === 0;

  if (cueScratched) fouls.push('scratch');
  if (firstContact === null) {
    fouls.push('nocontact');
  } else if (myGroup) {
    if (shootingEight) { if (firstContact !== 8) fouls.push('need8'); }
    else if (groupOf(firstContact) !== myGroup) fouls.push('wrongfirst');
  } else if (firstContact === 8) {
    fouls.push('eightfirst');
  }
  if (firstContact !== null && !objPocketed.length && !eightPocketed && !railAfter) fouls.push('norail');

  const foul = fouls.length > 0;
  const res = { foul, fouls, groups: newGroups, nextTurn: opp, ballInHand: false, respot8: false, winner: null, loseReason: null, assigned: null };

  if (eightPocketed) {
    if (isBreak) {
      res.respot8 = true;          // osmička na rozehrávce se vrací na stůl
    } else if (shootingEight && !foul) {
      res.winner = me;
      return res;
    } else {
      res.winner = opp;
      res.loseReason = !shootingEight ? 'early8' : 'foul8';
      return res;
    }
  }

  if (foul) { res.ballInHand = true; return res; }

  if (!myGroup && !isBreak && objPocketed.length) {
    newGroups[me] = groupOf(objPocketed[0]);
    newGroups[opp] = other(newGroups[me]);
    res.assigned = newGroups[me];
  }

  const g = newGroups[me];
  const potted = g ? objPocketed.some((id) => groupOf(id) === g) : objPocketed.length > 0;
  res.nextTurn = potted ? me : opp;
  return res;
}

module.exports = { evaluateShot, countGroup };
