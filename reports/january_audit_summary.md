# WindIQ — January 2026 Forecast Accuracy Audit Summary

## Executive Summary

This audit evaluates the day-ahead forecast accuracy of National Grid ESO / Elexon's **WINDFOR** forecasts against actual metered wind generation (**FUELHH**) across Great Britain for the entire month of **January 2026** (Delivery dates: January 2, 2026 through February 1, 2026).

A realistic day-ahead commercial decision process was enforced using a provisional cutoff of **09:00 Europe/London** on each decision date. No forecasts published after the decision cutoff were permitted in the evaluation.

## Key Performance Indicators (January 2026)

| Metric | Value | Description |
| :--- | :--- | :--- |
| **Evaluation Horizon** | 2026-01-01 to 2026-01-31 | 31 decision dates (744 delivery hours) |
| **Decision Cutoff** | 09:00 Europe/London | Converted dynamically to UTC via `zoneinfo` |
| **Valid Hourly Comparisons** | **744 / 744** | 100.00% evaluation completeness |
| **Forecast Coverage** | **100.0%** | Delivery hours with eligible pre-cutoff forecast |
| **Actual Data Completeness** | **100.0%** | Delivery hours with 2 valid half-hourly readings |
| **Mean Absolute Error (MAE)** | **2,038.91 MW** | Average magnitude of forecast error |
| **Root Mean Squared Error (RMSE)**| **2,504.76 MW** | Quadratic penalty weighting large errors |
| **Mean Absolute Percentage Error (MAPE)** | **22.04%** | Percentage error relative to actual generation |
| **Forecast Bias** | **+1,747.89 MW** | Signed mean error (Positive = Overforecast) |
| **Overforecast Hours** | **632** (84.9%) | Forecast exceeded actual generation |
| **Underforecast Hours** | **112** (15.1%) | Actual generation exceeded forecast |
| **Zero Error Hours** | **0** | Exact match |

## Daily Performance Analysis

- **Best Forecast Accuracy Day**: `2026-01-19` with MAE of **736.15 MW** (MAPE: 11.43%)
- **Worst Forecast Accuracy Day**: `2026-01-28` with MAE of **5,374.79 MW** (MAPE: 97.22%)
- **Systematic Forecast Bias**: The overall bias of **+1,747.89 MW** indicates a persistent overforecasting tendency across January 2026.

### Daily Performance Table

| Delivery Date | Decision Date | Hours | Forecast Cov % | Actual Comp % | MAE (MW) | RMSE (MW) | MAPE (%) | Bias (MW) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 2026-01-02 | 2026-01-01 | 24/24 | 100% | 100% | 3,109.9 | 3,171.4 | 20.66% | +3,109.9 |
| 2026-01-03 | 2026-01-02 | 24/24 | 100% | 100% | 2,102.2 | 2,463.2 | 13.93% | +2,102.2 |
| 2026-01-04 | 2026-01-03 | 24/24 | 100% | 100% | 1,146.5 | 1,255.4 | 8.81% | +1,146.5 |
| 2026-01-05 | 2026-01-04 | 24/24 | 100% | 100% | 1,331.7 | 1,583.9 | 14.08% | -55.9 |
| 2026-01-06 | 2026-01-05 | 24/24 | 100% | 100% | 2,085.0 | 2,444.5 | 34.78% | +1,835.3 |
| 2026-01-07 | 2026-01-06 | 24/24 | 100% | 100% | 1,492.8 | 1,733.6 | 13.06% | +1,468.1 |
| 2026-01-08 | 2026-01-07 | 24/24 | 100% | 100% | 1,949.2 | 2,153.4 | 68.58% | +844.8 |
| 2026-01-09 | 2026-01-08 | 24/24 | 100% | 100% | 839.4 | 1,074.6 | 8.27% | +804.9 |
| 2026-01-10 | 2026-01-09 | 24/24 | 100% | 100% | 1,101.2 | 1,238.0 | 12.83% | -86.2 |
| 2026-01-11 | 2026-01-10 | 24/24 | 100% | 100% | 4,801.6 | 4,853.4 | 37.25% | +4,801.6 |
| 2026-01-12 | 2026-01-11 | 24/24 | 100% | 100% | 4,868.2 | 5,120.9 | 33.86% | +4,868.2 |
| 2026-01-13 | 2026-01-12 | 24/24 | 100% | 100% | 1,403.3 | 1,584.5 | 14.68% | +156.5 |
| 2026-01-14 | 2026-01-13 | 24/24 | 100% | 100% | 1,077.4 | 1,236.1 | 12.45% | -84.2 |
| 2026-01-15 | 2026-01-14 | 24/24 | 100% | 100% | 1,041.8 | 1,149.3 | 11.17% | +1,041.8 |
| 2026-01-16 | 2026-01-15 | 24/24 | 100% | 100% | 782.8 | 926.0 | 10.24% | +352.0 |
| 2026-01-17 | 2026-01-16 | 24/24 | 100% | 100% | 1,726.8 | 1,802.2 | 33.61% | +1,726.8 |
| 2026-01-18 | 2026-01-17 | 24/24 | 100% | 100% | 1,554.8 | 1,611.3 | 33.75% | +1,554.8 |
| 2026-01-19 | 2026-01-18 | 24/24 | 100% | 100% | 736.1 | 812.6 | 11.43% | -730.1 |
| 2026-01-20 | 2026-01-19 | 24/24 | 100% | 100% | 1,054.6 | 1,438.9 | 6.58% | +351.8 |
| 2026-01-21 | 2026-01-20 | 24/24 | 100% | 100% | 3,658.3 | 3,766.5 | 23.78% | +3,658.3 |
| 2026-01-22 | 2026-01-21 | 24/24 | 100% | 100% | 2,666.4 | 2,781.3 | 16.68% | +2,666.4 |
| 2026-01-23 | 2026-01-22 | 24/24 | 100% | 100% | 1,514.8 | 1,600.1 | 9.56% | +1,514.8 |
| 2026-01-24 | 2026-01-23 | 24/24 | 100% | 100% | 1,925.9 | 2,213.3 | 12.72% | +1,925.9 |
| 2026-01-25 | 2026-01-24 | 24/24 | 100% | 100% | 1,891.2 | 2,042.0 | 15.04% | +1,891.2 |
| 2026-01-26 | 2026-01-25 | 24/24 | 100% | 100% | 1,980.9 | 2,206.4 | 18.48% | +1,980.9 |
| 2026-01-27 | 2026-01-26 | 24/24 | 100% | 100% | 3,479.1 | 3,578.4 | 21.93% | +3,479.1 |
| 2026-01-28 | 2026-01-27 | 24/24 | 100% | 100% | 5,374.8 | 5,399.4 | 97.22% | +5,374.8 |
| 2026-01-29 | 2026-01-28 | 24/24 | 100% | 100% | 1,739.0 | 1,775.1 | 17.37% | +1,739.0 |
| 2026-01-30 | 2026-01-29 | 24/24 | 100% | 100% | 1,371.7 | 1,590.7 | 8.91% | +1,371.7 |
| 2026-01-31 | 2026-01-30 | 24/24 | 100% | 100% | 2,390.2 | 2,490.5 | 24.45% | +2,390.2 |
| 2026-02-01 | 2026-01-31 | 24/24 | 100% | 100% | 1,008.1 | 1,067.8 | 17.22% | +983.0 |

## Regression Test Verification

The pipeline's automated test suite verified the January 2, 2026 14:00 UTC sample benchmark:
- **Decision Cutoff**: 2026-01-01 09:00 UTC
- **Selected Forecast**: 17,712 MW (from 07:30 UTC publication)
- **Actual Half-Hourly Generation**: 15,230 MW (14:00) & 15,796 MW (14:30)
- **Hourly Average Actual**: 15,513.0 MW
- **Forecast Error**: +2,199.0 MW
- **Absolute Error**: 2,199.0 MW
- **Absolute Percentage Error**: 14.18%
- **Regression Status**: **PASSED**

## Reproducibility

The entire extraction, normalization, forecast selection, and evaluation pipeline can be reproduced using:
```bash
python run_january_audit.py
```