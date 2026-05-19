
function d6(){
 return Math.floor(Math.random()*6)+1;
}

function ligeiaRoll(attribute, improvementDice=0){
 let dice=[d6(),d6()];

 for(let i=0;i<improvementDice;i++){
   dice.push(d6());
 }

 let highest=[...dice].sort((a,b)=>b-a).slice(0,2);

 let total=highest[0]+highest[1]+attribute;

 let criticalFail=highest[0]===1 && highest[1]===1;
 let criticalSuccess=highest[0]===6 && highest[1]===6;

 return {
   dice,
   highest,
   total,
   criticalFail,
   criticalSuccess
 };
}

console.log("Ligeia module loaded");
