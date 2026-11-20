import type { Guess } from "./models.js";

export const correctAnswerMessage = (answer: number | string) =>
  `${answer} is correct. Star awarded.`;
export const answerTooHighMessage = (answer: number | string) =>
  `${answer} is too high.`;
export const answerTooLowMessage = (answer: number | string) =>
  `${answer} is too low.`;
export const recentSubmissionMessage = () =>
  "You submitted an answer recently. Please wait before trying again.";
export const alreadyCompletedMessage = () =>
  "You have already completed this part.";
export const incorrectAnswerMessage = (answer: number | string) =>
  `${answer} is not correct.`;
export const wrongLevelMessage = () =>
  "You don't seem to be solving the right level. Double-check the part number.";
export const unexpectedResponseMessage = () =>
  "Received an unexpected response from Advent of Code. Check the website for details.";

function humanDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const cachedLowMessage = (answer: number | string, previous: Guess) =>
  `${answer} is still too low. Your highest low was ${previous.guess} on ${humanDate(previous.timestamp)}.`;
export const cachedHighMessage = (answer: number | string, previous: Guess) =>
  `${answer} is too high. Your lowest high was ${previous.guess} on ${humanDate(previous.timestamp)}.`;
export const cachedDuplicateMessage = (
  answer: number | string,
  previous: Guess,
) =>
  `You already tried ${answer} on ${humanDate(previous.timestamp)}. Please choose a different guess.`;
