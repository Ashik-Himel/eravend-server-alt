const template1 = (id, email, password) => {
  emailContent = `
    <p>Here is the contract paper attached you signed with Eravend.</p>
    <br />
    <h3>Bankdaten um Geld anzulegen</h3>
    <p>Bank: Sparkasse-Schwaben-Bodensee</p>
    <p>IBAN: DE27 7315 0000 1002 8549 49</p>
    <p>Verwendungszweck: ${id}</p>
    <br />
    <h3>Login Credentials</h3>
    <p><span style="font-weight:bold;">Email:</span> ${email}</p>
    <p><span style="font-weight:bold;">Password:</span> ${password}</p>
    <br />
    <p>Thank You</p>
    <p>Eravend</p>
  `;

  return emailContent;
}

module.exports = template1;
