const { Resend } = require("resend");
const { RESEND_KEY } = require("../config");

const resend = new Resend(RESEND_KEY);

exports.ResendEmail = async ({ to, from, subject, html }) => {
  try {
    await resend.emails.send({
      from: from,
      to: [to],
      subject: subject,
      html: html,
    });
  } catch (error) {
    console.log(error, "unable to send email");
  }
};
