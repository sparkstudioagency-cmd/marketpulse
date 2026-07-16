# MarketPulse Database Design

> Version: 0.1
> Status: Draft
> Last Updated: July 2026

---

# Purpose

MarketPulse is designed to become the standardized market intelligence platform for the South African fresh produce industry.

The purpose of this database is to accurately capture, store and organize daily market information exactly as it exists at South African Fresh Produce Markets while making the data significantly easier to search, analyse and understand.

The database is designed to support:

- Historical price tracking
- Multiple fresh produce markets
- Daily market reports
- AI-powered insights
- Price comparisons
- Market analytics
- Future forecasting
- APIs for third-party software

---

# Design Philosophy

The database models the real world.

Instead of designing the database around a website, we design it around how a fresh produce market actually operates.

Static information is stored once.

Changing information is stored historically.

No information should ever be overwritten.

Historical market data is one of the company's most valuable assets.

---

# Core Principles

## 1. Normalize Everything

Reference information should never be duplicated.

Examples:

- Products
- Containers
- Grades
- Markets

These are stored once and referenced everywhere else.

---

## 2. Preserve History

Prices change.

Products do not.

Daily market information must never overwrite previous days.

Every market publication becomes part of the permanent historical record.

---

## 3. Capture Every Published Data Point

If the market publishes it, we store it.

Examples include:

- Product
- Grade
- Container
- Mass
- Province
- Lowest Price
- Highest Price
- Average Price
- Quantity Sold
- Opening Balance
- Quantity On Hand
- Total Mass
- Value of Sales
- Transaction Count

Even if MarketPulse does not initially display every field, the database should preserve it for future analytics.

---

# What Is A Product?

A product is the produce itself.

Examples:

- Tomato
- Potato
- Lemon
- Cauliflower
- Apple
- Onion

The following are NOT products:

- Tomato Grade A
- Tomato 7kg
- Tomato Carton
- Tomato Grade A Carton

Those are combinations of multiple entities.

---

# Version 1 Entities

The first release of MarketPulse consists of six core entities and one operational table.

---

## Markets

Represents each official fresh produce market.

Examples:

- Tshwane Fresh Produce Market
- Cape Town Fresh Produce Market
- Johannesburg Fresh Produce Market

This table changes very rarely.

---

## Products

Represents the produce itself.

Examples:

- Tomato
- Potato
- Lemon
- Apple

Products never contain packaging or grades.

---

## Containers

Represents the packaging used by the market.

Examples:

- Carton
- Pocket
- Crate
- Punnet

Containers are referenced by Market Products.

---

## Grades

Represents the quality classification used by each market.

Examples:

- Grade A
- Grade B
- Class 1
- Export

If a market does not use grades, a "NO_GRADE" record should be used instead of NULL values.

---

## Market Products

Represents a permanent tradable product configuration.

A Market Product combines:

- Product
- Container
- Grade
- Mass
- Unit

Examples:

- Tomato | 7kg Carton | Grade A
- Potato | 10kg Pocket | Grade 1

These records are permanent and never duplicated.

---

## Daily Prices

Represents the daily statistics published by each market.

Each record belongs to:

- one Market
- one Market Product
- one Market Date

Daily Prices contain information such as:

- Lowest Price
- Average Price
- Highest Price
- Opening Quantity
- Quantity Sold
- Quantity On Hand
- Total Mass
- Total Sales

This is the largest table in the database and forms the historical market intelligence dataset.

---

## Scrape Runs

Stores operational information about every automated data collection process.

Examples include:

- Market scraped
- Date
- Status
- Records imported
- Runtime
- Errors

This table is used for monitoring, auditing and troubleshooting the scraping system.
# Long-Term Vision

MarketPulse is not intended to become another market website.

Its purpose is to become the central intelligence layer for South African fresh produce markets.

Future versions will support:

- Suppliers
- Producers
- Agents
- Buyers
- Price alerts
- AI forecasting
- Mobile applications
- Inventory management
- Procurement tools
- Public API
- Business intelligence dashboards

---

# Guiding Rule

Before adding a new table, ask:

"Does this represent a real-world entity?"

If the answer is no, it probably does not belong in the database.
## Version 1 Entity Relationship Diagram

Markets
    │
    ├──────────────┐
    │              │
    ▼              ▼
Daily Prices   Scrape Runs
    ▲
    │
Market Products
 ┌──┼──────────┐
 │  │          │
 ▼  ▼          ▼
Products  Containers  Grades
