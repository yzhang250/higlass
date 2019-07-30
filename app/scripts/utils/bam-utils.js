const parseMD = (mdString) => {
  let currPos = 1;
  let lettersBefore = [];
  const substitutions = [];

  for (let i = 0; i < mdString.length; i++) {
    // console.log(mdString[i], mdString[i].match(/[0-9]/));

    if (mdString[i].match(/[0-9]/g)) {
      // a number, keep on going
      lettersBefore.push(mdString[i]);
    } else {
      if (lettersBefore.length) {
        currPos += +lettersBefore.join('');
      }
      substitutions.push({
        pos: currPos,
        base: mdString[i],
      });

      lettersBefore = [];
      currPos += 1;
    }
  }

  return substitutions;
};

export default parseMD;
