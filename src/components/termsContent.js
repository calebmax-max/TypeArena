/**
 * termsContent.js
 * TypeArena Terms of Service & Policy Pack, as data.
 * Product terms and policy pack for the current TypeArena service.
 *
 * Bump TERMS_VERSION whenever you change any wording below, so you can tell
 * which version a user accepted (see the note about recording consent).
 */

export const TERMS_VERSION = '2026-10-12';
export const CONTACT_EMAIL = 'typearena45@gmail.com';
export const CONTACT_PHONE = '0700 384 172';

// Small helpers to keep the content below readable.
const p     = (text, lead) => ({ type: 'p', text, lead });
const ul    = (...items)   => ({ type: 'ul', items });
const ol    = (...items)   => ({ type: 'ol', items });
const table = (head, rows) => ({ type: 'table', head, rows });
const sec   = (heading, ...blocks) => ({ heading, blocks });

export const TERMS_DOCS = [
  // ───────────────────────────── TERMS OF SERVICE ─────────────────────────────
  {
    id: 'terms',
    tab: 'Terms of Service',
    title: 'TypeArena Terms of Service',
    effective: '12 October 2026',
    updated: '12 October 2026',
    intro: [
      p(`These Terms of Service ("Terms") are an agreement between you and TypeArena ("TypeArena", "we", "us"). By creating an account or using TypeArena you agree to these Terms, our Refund & Dispute Policy, our Complaints Policy and our Privacy Policy. If you do not agree, please do not use TypeArena.`),
    ],
    sections: [
      sec('1. What TypeArena is',
        p(`TypeArena is a learning and assessment platform for typing and practical digital skills. The current service lets you practise typing, complete structured training, take server-scored assessments, use certification and Pro services, create an optional Skills Passport, complete hiring assessments, and use school workspaces and assignments where you have access. The features available to you are the ones shown in the app.`)),

      sec('2. Who can use TypeArena',
        ul(
          `You must be 18 or older to create an account and use TypeArena.`,
          `You must give accurate information at sign-up (username, email, and a phone number that belongs to you) and keep it up to date.`,
          `One person, one account. You may not create or use several accounts, or let someone else use yours.`,
          `You must be legally allowed to use a service like this where you live. It is your responsibility to check.`,
        )),

      sec('3. Your account',
        p(`You are responsible for your password and for everything done through your account. Tell us straight away at typearena45@gmail.com if you think someone else has accessed it. We may suspend or close an account as set out in section 9.`),
        p(`If you report a problem, or if we need to check for cheating, fraud or a technical fault, authorised TypeArena staff may sign in to your account to look into it. Each time this happens we record which account was accessed and when. We only do this for support, security or legal reasons. Signing in this way may sign you out on your own device, so you may need to log in again.`, 'Support access.')),

      sec('4. Training, assessments and Skills Passport',
        ul(
          `Training progress, lesson passes, assessment results and certificates are recorded from server-side records. The browser cannot create a verified pass, score or certificate by itself.`,
          `Certification tests use a fixed passage, time limit and integrity checks. We may review typing telemetry, focus changes, paste attempts and other signals. A flagged result is not issued as a certificate unless it is approved through review.`,
          `A Skills Passport is an optional public link. It may show your display name, verified learning evidence, assessment results and certificates. It does not intentionally show your email, phone number or other private account records. You can revoke the public link.`,
          `A certificate or Skills Passport records the TypeArena evidence described on the page. It is not a government licence, employment guarantee or general professional qualification.`,
        )),

      sec('5. TypeArena Pro and payments',
        ul(
          `Pro is a time-limited subscription. The plan, price, currency and access period are shown before you confirm payment.`,
          `Pro payment is requested through a Daraja M-Pesa STK Push. Pro is activated only after TypeArena receives and verifies the provider callback, including the checkout, amount and receipt details. Sending an STK Push or entering a phone number does not by itself activate Pro.`,
          `Pro is linked to your server account and is available on signed-in devices while the subscription is active. It does not create a cash balance in your wallet and does not automatically renew unless the app explicitly says so.`,
          `Where the app says the certification fee is waived for Pro, the waiver applies only after you have completed any stated training and assessment requirements.`,
          `Certification, Pro and other digital purchases are subject to the Refund & Dispute Policy and the payment provider's processing rules.`,
        )),

      sec('6. Fair play',
        p(`To keep races fair, we verify each competitive result on our servers. This can include checking the passage shown, the timing of the race, keystroke patterns, whether the window lost focus during the race, and whether the speed is humanly possible.`),
        ul(
          `A result we cannot verify may be rejected and not recorded.`,
          `Results that look suspicious may be flagged for review by our team.`,
          `If we find cheating (for example scripts, bots, pasted text or automated tools), we may reject the result, suspend or close the account, and keep the evidence.`,
        ),
        p(`You can dispute a decision by contacting us.`)),

      sec('7. What you must not do',
        ul(
          `Cheat, use bots or scripts, exploit bugs, or interfere with races or other players.`,
          `Create multiple accounts, or use someone else's account or payment details.`,
          `Use TypeArena for fraud, money laundering, or to move money for others.`,
          `Attempt to hack, overload, reverse-engineer or damage the service.`,
          `Harass, threaten, impersonate or abuse other users, or post unlawful, hateful, sexual or misleading content in chat, usernames or profile images.`,
          `Arrange results with another player ("match fixing").`,
        )),

      sec('8. Your content',
        p(`You keep ownership of what you post ( usernames and profile images), but you give us a licence to host and display it as needed to run TypeArena. You are responsible for what you post. We may remove content that breaks these Terms. How we handle your personal data is explained in our Privacy Policy.`)),

      sec('9. Suspending or closing accounts',
        p(`We may warn, restrict, suspend or close an account if you break these Terms, if we reasonably suspect abuse or cheating, or if the law requires it. You may close your account at any time by contacting us. We will explain our reasons where we lawfully can.`)),

      sec('10. Availability',
        p(`We work hard to keep TypeArena running, but we do not promise it will always be available or error-free. Access may depend on your device, connection, account, school invitation or other eligibility requirements.`)),

      sec('11. Our responsibility to you',
        p(`To the extent the law allows, we are not responsible for losses caused by things outside our control, such as internet or mobile network outages, or for indirect or unforeseeable losses. Nothing in these Terms limits any right or liability that cannot be limited by law.`)),

      sec('12. Changes to these Terms',
        p(`We may update these Terms. If a change is important, we will tell you in the app or by email before it takes effect. If you keep using TypeArena after the change, you accept the new Terms. If you do not agree, you can stop using TypeArena and close your account.`)),

      sec('13. Law and disputes',
        p(`These Terms are governed by the laws of Kenya. Please try our Complaints Policy first. If we cannot resolve a dispute, the courts of Kenya have jurisdiction, and nothing here limits any rights you have as a consumer under Kenyan law.`)),

      sec('14. Contact',
        p(`TypeArena`),
        p(`typearena45@gmail.com`, 'Email:'),
        p(`0700 384 172`, 'Phone / WhatsApp:')),
    ],
  },

  // ───────────────────────────── REFUND & DISPUTE ─────────────────────────────
  {
    id: 'refunds',
    tab: 'Refunds & Disputes',
    title: 'TypeArena Refund & Dispute Policy',
    effective: '10 September 2026',
    intro: [
      p(`We want you to feel safe putting money into TypeArena. This policy explains when you get money back and how to raise a problem. It works together with our Terms of Service.`),
    ],
    sections: [
      sec('1. Quick guide',
        table(['Situation', 'What happens'], [
          ['Your Pro or certification payment was taken but access was not activated', 'We check the verified Daraja transaction. We activate the entitlement or resolve/refund the payment according to the provider record.'],
          ['You were charged twice for Pro or certification', 'We investigate the duplicate payment and resolve or refund it according to the verified provider record.'],
          ['You believe an assessment or certification decision is wrong', 'You may ask us to review the server record and integrity checks.'],
        ])),

      sec('2. Pro and certification payments',
        p(`Pro and standalone certification payments use an M-Pesa STK Push. The app may show a pending state while we wait for the Daraja callback. Pro or certification access is not granted merely because the prompt was sent; TypeArena must verify the checkout, amount and receipt.`),
        p(`If you completed payment and access is still pending after 30 minutes, contact us with the transaction reference, phone number, amount and M-Pesa receipt message. Do not repeat the payment until we have checked the first request.`)),

      sec('3. Disputing an assessment or decision',
        p(`You can dispute a certification result, a verification decision, or an account suspension.`),
        ol(
          `Tell us within 7 days of the assessment or decision. Send your username, the date and time, what you think went wrong, and any relevant reference.`,
          `We review the server record, assessment result, verification checks and integrity flags. We may ask for more information.`,
          `We decide and explain our decision in writing. If we made a mistake, we correct the record or entitlement.`,
          `You can appeal. If you disagree, reply within 7 days and ask for a second review by a different team member, who will look at the case fresh. Their decision is our final decision under this policy.`,
        ),
        p(`While a dispute is open, we may temporarily restrict the disputed result or entitlement until it is resolved.`)),

      sec('4. How to ask for a refund',
        p(`Email typearena45@gmail.com with your username, the transaction reference or code if your request concerns a payment, the date, and a short description of the problem. Screenshots help.`)),

      sec('5. How long it takes',
        ul(
          `We acknowledge your request within 2 business days.`,
          `We aim to resolve most cases within 7 business days, and complex ones within 14 business days. We will tell you if it will take longer and why.`,
          `Where a refund is due, it is handled using the verified payment record and the payment provider's processing rules.`,
        )),

      sec('6. Chargebacks and bank disputes',
        p(`Please contact us first: we can usually fix things faster than a chargeback. If you open a payment dispute with your bank or card provider for a payment that was valid, we may suspend the account until it is resolved, and we may recover any money paid out to you.`)),

      sec('7. What we may refuse',
        p(`We may refuse a refund or dispute that is fraudulent, repeated without new evidence, made after the time limit (unless there was a good reason for the delay), or that relates to a result verified as fair. We will always tell you the reason.`)),
    ],
  },

  // ───────────────────────────── COMPLAINTS ─────────────────────────────
  {
    id: 'complaints',
    tab: 'Complaints',
    title: 'TypeArena Complaints Policy',
    effective: '10 September 2026',
    intro: [
      p(`If something is wrong, we want to hear about it and fix it. This policy explains how to complain and what you can expect from us. Complaints are free and will not affect how we treat your account.`),
    ],
    sections: [
      sec('1. How to complain',
        ul(`Email: typearena45@gmail.com`, `Phone / WhatsApp: 0700 384 172`),
        p(`Please tell us: your username and the email or phone number on your account, what happened and when, any transaction references, what you would like us to do, and any screenshots that help.`)),

      sec('2. What we will do',
        ol(
          `Acknowledge your complaint within 2 business days and give you a reference number.`,
          `Investigate fairly. We will look at the records and, if needed, ask you or the payment provider for more information.`,
          `Respond in writing within 10 business days with what we found, what we will do, and why. If a case is complex, we will tell you within that time and give you a new date, which will not normally be more than 20 business days from your complaint.`,
          `Fix it. If we got something wrong, we will correct the record or entitlement and explain any payment resolution.`,
        )),

      sec('3. Complaints about other players',
        p(`If a player is cheating, harassing you or behaving badly, report them in the app or by email with their username and evidence (for example screenshots). We may warn, mute, suspend or remove them. We may not be able to tell you exactly what action we took for privacy reasons.`)),

      sec('4. Privacy and fairness',
        p(`We keep your complaint and our records confidential and use them only to deal with your complaint, to improve TypeArena and as the law requires. We will not treat you worse because you complained.`)),

      sec('5. Learning from complaints',
        p(`We review complaints regularly to find and fix the causes behind them, such as unclear rules, payment problems or bugs.`)),
    ],
  },

  // ───────────────────────────── PRIVACY ─────────────────────────────
  {
    id: 'privacy',
    tab: 'Privacy',
    title: 'TypeArena Privacy Policy',
    effective: '10 September 2026',
    updated: '10 September 2026',
    intro: [
      p(`This policy explains what personal information TypeArena collects, why we collect it, who can see it, and the choices you have. It applies to everyone who uses TypeArena and is part of our Terms of Service. We handle your information in line with the Data Protection Act, 2019 of Kenya.`),
    ],
    sections: [
      sec('1. Who we are',
        p(`TypeArena is the "data controller" for the information described here. You can reach us at typearena45@gmail.com or 0700 384 172.`)),

      sec('2. What we collect',
        table(['What', 'Details', 'Why we need it'], [
          ['Account details', 'Username, email address, password (stored in scrambled form, never as plain text), phone number if you give one, and a profile picture if you upload one', 'To create and secure your account, let you sign in, and contact you about your account'],
          ['Gameplay records', 'Practice results, speed, accuracy, time and progress records', 'To provide practice and show your progress'],
          ['Learning and assessment records', 'Course enrolments, lesson attempts and passes, practical-task results, certification attempts, scores, integrity flags and certificates', 'To provide training, assess performance, issue and verify certificates, and protect assessment integrity'],
          ['Skills Passport records', 'The public share code and the verified learning, assessment and certificate evidence you choose to publish', 'To create, display and revoke your optional public Skills Passport'],
          ['School records', 'Organisation or class membership, assignments, invitations and learning reports where you join a school programme', 'To operate school features and provide authorised teacher or organisation reporting'],
          ['Fair-play checks', 'Timing and typing patterns during competitive races, whether the window lost focus, and the resulting integrity flags kept with each race record', 'To detect bots, scripts and cheating so races stay fair'],
          ['Payment records', 'Pro and certification checkout details, payment status and provider reference codes', 'To verify paid access, resolve payment issues and keep required records'],
          ['Support and security records', 'Messages you send us, complaints and dispute details, a record of any time our staff sign in to your account (which account, when, and the IP address and browser used), and standard server logs', 'To help you, investigate problems and keep the service secure'],
        ]),
        p(`We do not store your card number or M-Pesa PIN. Payments are handled by our payment partners, who receive the details they need to process them.`)),

      sec('3. How we use your information',
        ul(
          `To provide TypeArena: accounts, practice, training, assessments, certificates, Skills Passports, hiring assessments and school features.`,
          `To process Pro and certification payments and keep accurate records.`,
          `To protect assessments and prevent cheating and abuse.`,
          `To answer your questions, complaints and refund or dispute requests.`,
          `To keep the service working, fix faults and improve it.`,
          `To meet our legal obligations.`,
        ),
        p(`We rely on the following reasons in law: to provide the service you asked for (our contract with you), our legitimate interests in running a fair and secure platform, your consent where we ask for it (for example when you upload a profile picture), and legal obligations.`),
        p(`We do not sell your personal information.`)),

      sec('4. Who can see your information',
        ul(
          `Other users or authorised school or hiring participants may see the profile and verified learning or assessment information that the relevant feature displays. A public Skills Passport shows only the evidence described on its page.`,
          `Our staff. Only authorised people who need it to run and support TypeArena. See section 5.`,
          `Service providers. Companies that help us run TypeArena, including payment partners, hosting and database providers. They may only use your information to provide their service to us.`,
          `Authorities and legal reasons. We may share information where the law requires it, to respond to valid legal requests, or to protect people from fraud or harm.`,
        )),

      sec('5. Staff access to accounts',
        p(`To help with a problem you report, or to check for cheating or fraud, authorised staff may sign in to your account. Each time this happens we record which account was accessed, when, and the IP address and browser used. We only do this for support, security or legal reasons. It may sign you out on your own device. We may also review chat messages that are reported to us or that we need to check to investigate abuse.`)),

      sec('6. Information on your device',
        p(`TypeArena uses your browser's local storage to keep you signed in and to remember settings and local practice information, such as sound, music, personal bests and recent activity. You can clear this in your browser settings, but you will then be signed out and lose those saved settings.`)),

      sec('7. How long we keep it',
        ul(
          `Account and gameplay information: for as long as your account is open.`,
          `Payment and dispute records: for 7 years or as long as the law requires, even if you close your account.`,
          `Security and support records: for as long as needed to keep the service safe and to deal with any dispute.`,
        ),
        p(`When we no longer need information, we delete it or make it anonymous.`)),

      sec('8. Where your information is stored',
        p(`Your information is stored on servers run by our hosting and database providers. Some of these servers may be outside Kenya. When information leaves Kenya, we make sure it is protected as Kenyan law requires.`)),

      sec('9. Keeping it safe',
        p(`We take reasonable steps to protect your information, including storing passwords in scrambled form, using secure connections, and limiting who can access the data. No system is completely secure, so please use a strong, unique password and tell us straight away if you think your account has been accessed by someone else.`)),

      sec('10. Your rights',
        p(`You have the right to:`),
        ul(
          `Know what information we hold about you, and get a copy.`,
          `Correct information that is wrong or incomplete.`,
          `Delete your information, subject to what we must keep by law (section 7).`,
          `Object to, or ask us to limit, how we use your information.`,
          `Withdraw your consent where we rely on it (this does not affect what we did before).`,
          `Take your data with you in a common format where the law allows.`,
        ),
        p(`To use any of these, email typearena45@gmail.com from the address on your account. We may ask you to confirm it is really you. We aim to reply within 14 days.`),
        p(`Email us to request deletion. We will delete or anonymise your personal information, except records we must keep for financial or legal reasons. Assessment records may be kept without your name where needed for verification and reporting.`, 'Deleting your account:')),

      sec('11. Children',
        p(`TypeArena is for people aged 18 and over. We do not knowingly collect information from anyone under 18. If we learn that a child has signed up, we will close the account and delete the information.`)),

      sec('12. Changes to this policy',
        p(`We may update this policy. If a change is important, we will tell you in the app or by email before it takes effect. The date at the top shows when it was last changed.`)),

      sec('13. Contact and complaints',
        p(`Questions about your privacy: typearena45@gmail.com or 0700 384 172. We will try to put things right first (see our Complaints Policy). You also have the right to complain to the Office of the Data Protection Commissioner of Kenya if you think we have not handled your information properly.`)),
    ],
  },
];
