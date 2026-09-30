import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Acceptable Use Policy" };

const SECTIONS: LegalSection[] = [
  {
    id: "refuses",
    title: "What Caveman will not build",
    body: ["Caveman refuses requests, and we may stop builds and close accounts, for software whose purpose is:"],
    list: [
      "Malware: ransomware, viruses, worms, keyloggers, info-stealers, botnets, cryptominers that run without consent, or code that hides from or disables security tools.",
      "Unauthorized access: exploits or scanners aimed at systems you do not own or have written permission to test, credential stuffing, brute forcing, or getting around authentication, paywalls or DRM.",
      "Fraud and deception: phishing pages, fake logins, sites that impersonate real people, brands or organizations, fake reviews, scams, or tools for payment or identity fraud.",
      "Spam and platform abuse: bulk unsolicited messaging, fake account creation, CAPTCHA solving, or bots that break another service's rules or rate limits.",
      "Surveillance and stalking: covert tracking, spyware, scraping or combining personal data to profile, locate or harass people.",
      "Harm to people: harassment, threats, content promoting violence or terrorism, or anything sexualizing minors.",
      "Dangerous weapons: help making biological, chemical, nuclear, radiological or explosive weapons.",
      "Anything else illegal where you or we are, or that infringes someone's copyright, trademark or privacy.",
    ],
  },
  {
    id: "security-research",
    title: "Security research",
    body: [
      "Defensive and educational security work is welcome: tests for your own systems, CTF solutions, detection rules, and tools for authorized penetration tests. If a request looks offensive, say in the prompt what you are authorized to do.",
    ],
  },
  {
    id: "service",
    title: "Using the service fairly",
    body: ["Do not:"],
    list: [
      "Try to break out of the build sandbox, reach other users' data, or attack Caveman's infrastructure. Report weaknesses to us instead.",
      "Use Caveman as a general-purpose compute host, proxy, or cryptocurrency miner.",
      "Create multiple accounts to get around spending limits or bans, or share one account between many people.",
      "Scrape the service or overload it with automated requests.",
    ],
  },
  {
    id: "enforcement",
    title: "Enforcement",
    body: [
      "We may decline a request, stop a build, delete its output, suspend or close the account, and report illegal activity. Where it makes sense we will tell you why. If you think we got it wrong, email us.",
    ],
  },
  {
    id: "report",
    title: "Reporting abuse or security issues",
    body: [`Email ${CONTACT_EMAIL} with what you saw. For security vulnerabilities you can also use the private reporting link in the GitHub repository.`],
  },
];

export default function AcceptableUsePage() {
  return (
    <LegalDocument
      title="Acceptable Use Policy"
      intro="What Caveman won't build, and how to use the service without spoiling it for everyone else."
      sections={SECTIONS}
    />
  );
}
