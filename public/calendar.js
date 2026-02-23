// calendar.js - Handles in-game calendar and season logic

export const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
export const DAYS_PER_MONTH = 28;
export const MONTHS_PER_YEAR = 4;
export const MINUTES_PER_DAY = 4;

export class Calendar {
  constructor() {
    this.day = 1;
    this.month = 0; // 0 = Spring
    this.year = 1;
    this.season = SEASONS[this.month];
    this._timer = null;
    this._onDayChange = null;
    this.gameTimeMs = 0; // In-game time in ms
  }

  start(onDayChange) {
    this._onDayChange = onDayChange;
    this.gameTimeMs = 0;
    // No timer needed, time is advanced by game loop
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  nextDay() {
    this.day++;
    if (this.day > DAYS_PER_MONTH) {
      this.day = 1;
      this.month++;
      if (this.month >= MONTHS_PER_YEAR) {
        this.month = 0;
        this.year++;
      }
      this.season = SEASONS[this.month];
    }
    if (this._onDayChange) this._onDayChange(this);
  }

  getSeason() {
    return this.season;
  }

  getDateString() {
    return `${this.season} Day ${this.day}, Year ${this.year}`;
  }

  getTimeOfDay() {
    // Returns hour:minute string for current in-game day
    const msPerDay = MINUTES_PER_DAY * 60 * 1000;
    const msToday = this.gameTimeMs % msPerDay;
    const totalMinutes = Math.floor(msToday / msPerDay * 24 * 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }
}
