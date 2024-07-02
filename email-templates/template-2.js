const template2 = id => {
  emailContent = `
    <p>Here is the contract paper you signed with Eravend.</p>
    <br />
    <h3>Bankdaten um Geld anzulegen</h3>
    <p>Bank: Sparkasse-Schwaben-Bodensee</p>
    <p>IBAN: DE27 7315 0000 1002 8549 49</p>
    <p>Verwendungszweck: ${id}</p>
    <br />
    <p>Thank You</p>
    <p>Eravend</p>
  `

  return emailContent;
}

module.exports = template2;
