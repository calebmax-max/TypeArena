/**
 * termsContent.js
 * TypeArena Terms of Service & Policy Pack, as data.
 * Source: TypeArena_Legal_Policies.pdf (effective 10 September 2026).
 *
 * Bump TERMS_VERSION whenever you change any wording below, so you can tell
 * which version a user accepted (see the note about recording consent).
 */

export const TERMS_VERSION = '2026-09-10';
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
    effective: '10 September 2026',
    updated: '10 September 2026',
    intro: [
      p(`These Terms of Service ("Terms") are an agreement between you and TypeArena ("TypeArena", "we", "us"). By creating an account or using TypeArena you agree to these Terms, our Refund & Dispute Policy, our Complaints Policy and our Privacy Policy. If you do not agree, please do not use TypeArena.`),
    ],
    sections: [
      sec('1. What TypeArena is',
        p(`TypeArena is a multiplayer typing race platform. You can practise for free, race other players, join tournaments, create private rooms (with or without a stake), and buy digital items in the marketplace. Money on TypeArena is held in an in-app wallet.`)),

      sec('2. Who can use TypeArena',
        ul(
          `You must be 18 or older to create an account, add money to your wallet, or take part in any tournament or staked room.`,
          `You must give accurate information at sign-up (username, email, and a phone number that belongs to you) and keep it up to date.`,
          `One person, one account. You may not create or use several accounts, or let someone else use yours.`,
          `You must be legally allowed to use a service like this where you live. It is your responsibility to check.`,
        )),

      sec('3. Your account',
        p(`You are responsible for your password and for everything done through your account. Tell us straight away at typearena45@gmail.com if you think someone else has accessed it. We may suspend or close an account as set out in section 12.`),
        p(`If you report a problem, or if we need to check for cheating, fraud or a technical fault, authorised TypeArena staff may sign in to your account to look into it. Each time this happens we record which account was accessed and when. We only do this for support, security or legal reasons. Signing in this way may sign you out on your own device, so you may need to log in again.`, 'Support access.')),

      sec('4. Your wallet',
        ol(
          `Your wallet balance is held in Kenyan Shillings (KES). If you pay in another currency (for example by card), the amount is converted at the rate applied by our payment partner.`,
          `You can add money by the payment methods shown in the app (for example M-Pesa or card). Money is added to your wallet only after our payment partner confirms the payment.`,
          `Your wallet is not a bank account. It earns no interest, is not covered by any deposit insurance scheme, and balances cannot be transferred to another user.`,
          `Money you use for entry fees, stakes and purchases is deducted from your wallet at the time described in sections 5 and 7. When a stake is "locked", it is set aside until the race finishes or is cancelled.`,
          `Your wallet history in the app shows your top-ups and withdrawals. Please check it and tell us quickly about anything that looks wrong (see the Refund & Dispute Policy).`,
          `Payments and withdrawals are processed by third-party payment providers. We are not responsible for delays or charges that come from them, but we will help you follow up.`,
        )),

      sec('5. Racing, tournaments and stakes',
        p(`Practice races and public one-on-one matchmaking races are free and do not involve prizes or cash.`, '5.1 Free play.'),
        p(``, '5.2 Tournaments.'),
        ul(
          `Each tournament match has 3 or more players. The number of players and the entry fee are shown before you join.`,
          `You are charged the entry fee only when the match is full and about to start. You need enough wallet balance at that moment.`,
          `All entry fees form a prize pool. The pool is shared like this: 1st place 50%, 2nd place 25%, 3rd place 15%, and the platform keeps 10%.`,
          `In a small match, 2nd and 3rd place can receive less than the entry fee they paid. Example: 3 players each pay KES 100, so the pool is KES 300. First place receives KES 150, second KES 75, third KES 45, and TypeArena keeps KES 30.`,
        ),
        p(``, '5.3 Private rooms.'),
        ul(
          `The host of a private room may set a stake (it can be zero). Everyone who joins a staked room agrees to pay that stake, and it is locked from their wallet when they join. If you do not want to pay the stake, do not join.`,
          `Two players (heads-up): the winner receives 95% of the pool and TypeArena keeps 5%. Example: two players each stake KES 100, so the winner receives KES 190 and TypeArena keeps KES 10.`,
          `Three or more players: the pool is shared the same way as a tournament (50% / 25% / 15%, platform 10%).`,
          `The host can cancel a room only while it is still waiting for players. If the host cancels, every locked stake is returned in full. Once a race has started it cannot be cancelled.`,
        ),
        p(`Results are calculated by our servers, not by your device. Players are ranked by typing speed (words per minute), then by accuracy, then by who finished first. Races have a fixed time limit. If time runs out, or you disconnect, your result is what you had typed up to that moment.`, '5.4 How the winner is decided.'),
        p(`Prizes are credited to your wallet when the race is settled. You can then withdraw them under section 8.`, '5.5 Prizes.'),
        p(`Race outcomes depend on typing speed and accuracy. Even so, you can lose money when you enter a paid race. Only stake what you can comfortably afford to lose, and stop if it stops being fun. If you want to limit or close your account for this reason, contact us at typearena45@gmail.com and we will act on your request.`, '5.6 Skill, not chance.')),

      sec('6. Fair play',
        p(`To keep races fair, we verify each competitive result on our servers. This can include checking the passage shown, the timing of the race, keystroke patterns, whether the window lost focus during the race, and whether the speed is humanly possible.`),
        ul(
          `A result we cannot verify may be rejected and not recorded.`,
          `Results that look suspicious may be flagged for review by our team.`,
          `If we find cheating (for example scripts, bots, pasted text, automated tools, or teaming up with another player), we may cancel the result, withhold or reverse prizes from that race, suspend or close the account, and keep the evidence.`,
        ),
        p(`You can dispute a decision under the Refund & Dispute Policy.`)),

      sec('7. Marketplace',
        ul(
          `The marketplace sells digital items and perks for use inside TypeArena (for example cosmetics and account perks).`,
          `Items are paid for from your wallet and delivered immediately. You can own each item only once.`,
          `Items have no cash value, cannot be sold, gifted or transferred, and are lost if your account is closed for breaking these Terms.`,
          `Because items are digital and delivered immediately, purchases are final, except as set out in the Refund & Dispute Policy (for example a failed delivery or a duplicate charge).`,
        )),

      sec('8. Withdrawals',
        ul(
          `You can withdraw your available wallet balance using the withdrawal methods shown in the app (for example M-Pesa). Money locked in an unfinished race cannot be withdrawn.`,
          `Withdrawals must go to an account or phone number that belongs to you.`,
          `A withdrawal fee applies. It is shown before you confirm, and it is charged on top of the amount you withdraw. For example, if you withdraw KES 1,000 and the fee is KES 30, KES 1,030 leaves your wallet. Fees may change; the fee shown at the time you confirm is the fee that applies.`,
          `Most withdrawals are quick, but they depend on our payment partners and can take longer. If a withdrawal fails, the full amount and the fee are returned to your wallet.`,
          `We may ask you to confirm your identity or explain unusual activity before a withdrawal, and we may delay a withdrawal while we investigate suspected fraud, cheating or money laundering. We follow applicable laws on preventing fraud and money laundering.`,
        )),

      sec('9. Fees at a glance',
        table(['Activity', 'What applies'], [
          ['Creating an account, practising, public 1v1 races', 'Free'],
          ['Adding money to your wallet', 'We add no fee. Your payment provider may charge one.'],
          ['Tournaments', 'Entry fee shown before you join. Prize pool: 50% / 25% / 15%, platform 10%.'],
          ['Private room, two players', 'Winner 95%, platform 5% of the pool'],
          ['Private room, three or more players', 'Same split as tournaments'],
          ['Marketplace items', 'Price shown in the app'],
          ['Withdrawals', 'Fee shown before you confirm, charged on top of the amount'],
        ])),

      sec('10. What you must not do',
        ul(
          `Cheat, use bots or scripts, exploit bugs, or interfere with races or other players.`,
          `Create multiple accounts, or use someone else's account or payment details.`,
          `Use TypeArena for fraud, money laundering, or to move money for others.`,
          `Attempt to hack, overload, reverse-engineer or damage the service.`,
          `Harass, threaten, impersonate or abuse other users, or post unlawful, hateful, sexual or misleading content in chat, usernames or profile images.`,
          `Arrange results with another player ("match fixing").`,
        )),

      sec('11. Your content',
        p(`You keep ownership of what you post (such as chat messages, usernames and profile images), but you give us a licence to host and display it as needed to run TypeArena. You are responsible for what you post. We may remove content that breaks these Terms. How we handle your personal data is explained in our Privacy Policy.`)),

      sec('12. Suspending or closing accounts',
        p(`We may warn, restrict, suspend or close an account if you break these Terms, if we reasonably suspect fraud or cheating, or if the law requires it. You may close your account at any time by contacting us. If your account is closed, we will let you withdraw your remaining available balance, unless the balance is linked to cheating, fraud or a legal or payment-provider investigation, in which case we may hold or reverse it. We will explain our reasons where we lawfully can.`)),

      sec('13. Availability and changes to the service',
        p(`We work hard to keep TypeArena running, but we do not promise it will always be available or error-free. We may change or stop features. If a race or tournament cannot be completed because of a fault on our side, we may cancel it and return the stakes or entry fees.`)),

      sec('14. Our responsibility to you',
        p(`We are responsible for money in your wallet and for settling races according to these Terms. To the extent the law allows, we are not responsible for losses caused by things outside our control (for example internet or mobile network outages, or failures of payment providers), or for indirect or unforeseeable losses. Nothing in these Terms limits any right or liability that cannot be limited by law.`)),

      sec('15. Changes to these Terms',
        p(`We may update these Terms. If a change is important, we will tell you in the app or by email before it takes effect. If you keep using TypeArena after the change, you accept the new Terms. If you do not agree, you can close your account and withdraw your balance.`)),

      sec('16. Law and disputes',
        p(`These Terms are governed by the laws of Kenya. Please try our Complaints Policy first. If we cannot resolve a dispute, the courts of Kenya have jurisdiction, and nothing here limits any rights you have as a consumer under Kenyan law.`)),

      sec('17. Contact',
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
          ['Your payment was taken but your wallet was not credited', 'We check with the payment provider and credit your wallet once the payment is confirmed.'],
          ['You were charged twice for the same top-up or purchase', 'We refund the duplicate to your wallet, or to your original payment method if you ask.'],
          ['A withdrawal failed', 'The withdrawal amount and fee are returned to your wallet.'],
          ['A private room is cancelled by the host before the race starts', 'Every stake is returned in full.'],
          ['A tournament is cancelled by us', 'Every entry fee is returned in full.'],
          ['A race could not finish because of a fault on our side', 'We cancel the race and return stakes or entry fees, or, where fair, settle it based on the results we have.'],
          ['You lost a race fairly', 'No refund. Race results are final once verified.'],
          ['You disconnected or your internet dropped during a race', 'No refund. Your result is what you typed until time ran out.'],
          ['You changed your mind after a race started', 'No refund. Stakes and entry fees cannot be cancelled once the race has started.'],
          ['A marketplace item was not delivered, or was charged twice', 'We deliver the item or refund you.'],
          ['You changed your mind about a marketplace item', 'No refund, because items are digital and delivered immediately.'],
          ['We removed your result or prize for cheating', 'No refund and the prize is not paid. You may dispute the decision (section 3).'],
        ])),

      sec('2. Wallet problems',
        p(`Some payments take a few minutes to confirm. If your wallet has not been credited after 30 minutes, contact us with:`, 'Top-up not credited.'),
        ul(
          `the phone number or card used,`,
          `the amount and date and time,`,
          `the M-Pesa message or payment reference (for example the receipt code).`,
        ),
        p(`We will verify the payment with our payment partner. If the money reached us, we credit it. If the money left you but did not reach us, we will help you trace it with the payment provider.`),
        p(`If a withdrawal fails, is rejected or times out, the amount and the fee are returned to your wallet automatically. If you do not see it within 24 hours, contact us.`, 'Failed withdrawal.'),
        p(`Withdrawals go to the number or account you enter. If you enter the wrong one, we cannot always recover the money, but contact us immediately and we will ask our payment partner to try. Please check the details carefully before you confirm.`, 'Wrong number.')),

      sec('3. Disputing a race result or a decision',
        p(`You can dispute a race result, a prize, a verification decision, or an account suspension.`),
        ol(
          `Tell us within 7 days of the race or decision. Send: your username, the date and time, the room or tournament name, and what you think went wrong.`,
          `We review. We look at the race record (speed, accuracy, timing), the verification checks, any anti-cheat flags, and connection and payment logs. We may ask you for more information (for example a screenshot or screen recording).`,
          `We decide and explain our decision in writing. If we made a mistake, we correct the result and credit your wallet.`,
          `You can appeal. If you disagree, reply within 7 days and ask for a second review by a different team member, who will look at the case fresh. Their decision is our final decision under this policy.`,
        ),
        p(`While a dispute is open, we may hold the disputed prize until it is resolved.`)),

      sec('4. How to ask for a refund',
        p(`Email typearena45@gmail.com (or use the support option in the app) with your username, the phone number or account used, the transaction reference or code, the amount, the date, and a short description of the problem. Screenshots help.`)),

      sec('5. How long it takes',
        ul(
          `We acknowledge your request within 2 business days.`,
          `We aim to resolve most cases within 7 business days, and complex ones within 14 business days. We will tell you if it will take longer and why.`,
          `Refunds are normally made to your TypeArena wallet. If you ask for a refund to your original payment method, it is subject to our payment partner's processing time and rules.`,
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
          `Fix it. If we got something wrong, we will correct it, and where money is owed we will credit your wallet.`,
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
          ['Gameplay records', 'Race results (speed, accuracy, time, placing), wins, points, season and leaderboard stats, and any prizes won', 'To run races, rankings and tournaments, and to show your progress'],
          ['Fair-play checks', 'Timing and typing patterns during competitive races, whether the window lost focus, and the resulting integrity flags kept with each race record', 'To detect bots, scripts and cheating so races stay fair'],
          ['Wallet and payment records', 'Top-ups, stakes, entry fees, prizes, purchases and withdrawals (amounts, dates, status and reference codes), plus the phone number or account you pay from or withdraw to', 'To keep your balance correct, settle races, process payments and withdrawals, and resolve disputes'],
          ['Marketplace purchases', 'Which items you have bought and equipped', 'To deliver your items'],
          ['Messages and activity', 'Chat messages you send to other players, and when you were last online', 'To let players talk to each other and show who is online'],
          ['Support and security records', 'Messages you send us, complaints and dispute details, a record of any time our staff sign in to your account (which account, when, and the IP address and browser used), and standard server logs', 'To help you, investigate problems and keep the service secure'],
        ]),
        p(`We do not store your card number or M-Pesa PIN. Payments are handled by our payment partners, who receive the details they need to process them.`)),

      sec('3. How we use your information',
        ul(
          `To provide TypeArena: accounts, races, tournaments, private rooms, your wallet and the marketplace.`,
          `To process payments, prizes and withdrawals, and to keep accurate financial records.`,
          `To detect and prevent cheating, fraud, money laundering and abuse.`,
          `To answer your questions, complaints and refund or dispute requests.`,
          `To keep the service working, fix faults and improve it.`,
          `To meet our legal obligations.`,
        ),
        p(`We rely on the following reasons in law: to provide the service you asked for (our contract with you), our legitimate interests in running a fair and secure platform, your consent where we ask for it (for example when you upload a profile picture), and legal obligations.`),
        p(`We do not sell your personal information.`)),

      sec('4. Who can see your information',
        ul(
          `Other players. Your username, profile picture, equipped items, stats and leaderboard position are visible to other users. People in a race room with you can see your progress, and live races can be watched by others. Your chat messages are seen by the person you send them to.`,
          `Our staff. Only authorised people who need it to run and support TypeArena. See section 5.`,
          `Service providers. Companies that help us run TypeArena, such as payment partners (for example Safaricom for M-Pesa and our payment processor), and hosting and database providers. They may only use your information to provide their service to us. We also use an AI service to generate typing passages. It receives only a general request (such as the language and race mode) and none of your personal details.`,
          `Authorities and legal reasons. We may share information where the law requires it, to respond to valid legal requests, or to protect people from fraud or harm.`,
          `A new owner. If TypeArena is ever sold or merged, your information may move to the new owner, who must protect it under this policy.`,
        )),

      sec('5. Staff access to accounts',
        p(`To help with a problem you report, or to check for cheating or fraud, authorised staff may sign in to your account. Each time this happens we record which account was accessed, when, and the IP address and browser used. We only do this for support, security or legal reasons. It may sign you out on your own device. We may also review chat messages that are reported to us or that we need to check to investigate abuse.`)),

      sec('6. Information on your device',
        p(`TypeArena uses your browser's local storage to keep you signed in and to remember your settings (such as sound and music), personal bests, win streaks, recent races and daily challenge progress. You can clear this in your browser settings, but you will then be signed out and lose those saved settings. If we add analytics or advertising tools in future, we will update this policy first.`)),

      sec('7. How long we keep it',
        ul(
          `Account and gameplay information: for as long as your account is open.`,
          `Wallet, payment and dispute records: for 7 years or as long as the law requires, even if you close your account.`,
          `Chat messages: until you or the other person deletes your account, or until we remove them under our Terms.`,
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
        p(`Withdraw your wallet balance first, then email us to request deletion. We will delete or anonymise your personal information, except records we must keep for financial or legal reasons. Race results may be kept without your name so leaderboards and tournament records stay accurate.`, 'Deleting your account:')),

      sec('11. Children',
        p(`TypeArena is for people aged 18 and over. We do not knowingly collect information from anyone under 18. If we learn that a child has signed up, we will close the account and delete the information.`)),

      sec('12. Changes to this policy',
        p(`We may update this policy. If a change is important, we will tell you in the app or by email before it takes effect. The date at the top shows when it was last changed.`)),

      sec('13. Contact and complaints',
        p(`Questions about your privacy: typearena45@gmail.com or 0700 384 172. We will try to put things right first (see our Complaints Policy). You also have the right to complain to the Office of the Data Protection Commissioner of Kenya if you think we have not handled your information properly.`)),
    ],
  },
];