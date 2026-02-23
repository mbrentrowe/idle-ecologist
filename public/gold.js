// gold.js - Handles player gold logic

export class Gold {
  constructor(initial = 0) {
    this.amount = initial;
    this._onChange = null;
  }

  add(value) {
    this.amount += value;
    if (this._onChange) this._onChange(this.amount);
  }

  spend(value) {
    if (this.amount >= value) {
      this.amount -= value;
      if (this._onChange) this._onChange(this.amount);
      return true;
    }
    return false;
  }

  setOnChange(cb) {
    this._onChange = cb;
  }

  getFormatted() {
    return this.amount.toLocaleString();
  }
}
