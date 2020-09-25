/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import { VisualSettings } from "./settings";

import * as d3 from "d3";
import { map } from "d3";
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

enum ViolationType {
  Missing = "MISSING",
  Did = "DID",
}

export interface Violation {
  key: string;
  violationType: ViolationType;
  violationActivity: string;
  caseIds: Array<Number>;
  specifications: Map<string, Specification>;
}

export interface Specification {
  name: string;
  caseIds: Array<Number>;
}

export class Visual implements IVisual {
  private violations: Map<string, Violation> = new Map();

  private svg: Selection<SVGElement>;
  private container: Selection<SVGElement>;
  private target: HTMLElement;
  private updateCount: number;
  private settings: VisualSettings;
  private textNode: Text;
  private host: IVisualHost;
  private windowsLoaded: number;

  constructor(options: VisualConstructorOptions) {
    this.svg = d3.select(options.element).append("svg");
    this.container = this.svg.append("g");

    this.target = options.element;
    this.updateCount = 0;
    this.windowsLoaded = 0;
    this.host = options.host;
    if (typeof document !== "undefined") {
      const new_p: HTMLElement = document.createElement("p");
      new_p.appendChild(document.createTextNode("Message:"));
      const new_em: HTMLElement = document.createElement("em");
      this.textNode = document.createTextNode(this.updateCount.toString());
      new_em.appendChild(this.textNode);
      new_p.appendChild(new_em);
      this.target.appendChild(new_p);
    }
  }

  public update(options: VisualUpdateOptions) {
    // Empty violations
    this.violations.clear();

    // Collect data from PowerBI
    let table = options.dataViews[0].table;

    // Get happy path array
    let happyPathArray = [
      "Create Purchase Order Item",
      "Receive Order Confirmation",
      "Record Goods Receipt",
      "Record Invoice Receipt",
      "Pay Invoice",
    ];

    let rowCount = options.dataViews[0].table.rows.length;

    if (options.dataViews[0].metadata.segment) {
      this.textNode.textContent = `Loading more data. ${rowCount} rows loaded so far (over ${this.windowsLoaded} fetches)...`;

      let canFetchMore = this.host.fetchMoreData();

      console.log(canFetchMore);
      if (!canFetchMore) {
        this.textNode.textContent = `Memory limit hit after ${this.windowsLoaded} fetches. We managed to get ${rowCount} rows.`;
      }
      return canFetchMore;
    } else {
      this.textNode.textContent = `We have all the data we can get (${rowCount} rows over ${this.windowsLoaded} fetches)!`;
    }

    // Search for violations
    if (happyPathArray.length != 0) {
      this.searchForViolations(table, happyPathArray);

      // Sort violations
      this.violations = new Map(
        [...this.violations.entries()].sort(
          (a, b) => b[1].caseIds.length - a[1].caseIds.length
        )
      );

      // Sort specifications
      this.violations.forEach((v) => {
        v.specifications = new Map(
          [...v.specifications.entries()].sort(
            (a, b) => b[1].caseIds.length - a[1].caseIds.length
          )
        );
      });

      // Plot violations
      this.plotViolations(this.violations, table, options);
    }
  }

  // private getHappyPathArray(table: powerbi.DataViewTable) {
  //   let happyPathArray = [];
  //   table.rows.forEach((row) => {
  //     console.log(row);
  //     let ihp = row[1] + "";
  //     let variant = row[2] + "";
  //     if (ihp) {
  //       happyPathArray = variant.toString().split("->");
  //     }
  //   });
  //   console.log(happyPathArray);
  //   return happyPathArray.map((a) => a.trim());
  // }

  private searchForViolations(
    table: powerbi.DataViewTable,
    happyPathArray: Array<string>
  ) {
    table.rows.forEach((row) => {
      let caseId = +row[0];
      let variant = row[2] + "";
      let specification = row[3] + "";

      let violations = this.getViolationPerCase(
        variant.toString(),
        happyPathArray
      );

      violations.forEach((keyArray) => {
        let key = keyArray[0] + ":" + keyArray[1];

        if (this.violations.has(key)) {
          this.violations.get(key).caseIds.push(caseId);
        } else {
          this.violations.set(key, <Violation>{
            key: key,
            violationType: keyArray[0],
            violationActivity: keyArray[1],
            caseIds: [caseId],
            specifications: new Map(),
          });
        }

        let violation = this.violations.get(key);

        if (violation.specifications.has(specification)) {
          violation.specifications.get(specification).caseIds.push(caseId);
        } else {
          violation.specifications.set(specification, <Specification>{
            name: specification,
            caseIds: [caseId],
          });
        }
      });
    });
  }

  private getViolationPerCase(variant: string, happyPathArray: Array<string>) {
    let variantArray = variant.toString().split("->");
    variantArray = variantArray.map((a) => a.trim());

    let happyPathSet = new Set(happyPathArray);
    let variantSet = new Set(variantArray);
    let violations = [];

    happyPathSet.forEach(function (val) {
      if (!variantSet.has(val)) violations.push(val);
    });
    variantSet.forEach(function (val) {
      if (!happyPathSet.has(val)) violations.push(val);
    });

    for (let i = 0; i < violations.length; i++) {
      if (happyPathArray.indexOf(violations[i]) !== -1) {
        violations[i] = [ViolationType.Missing, violations[i]];
      } else {
        violations[i] = [ViolationType.Did, violations[i]];
      }
    }
    return violations;
  }

  private plotViolations(
    violations: Map<string, Violation>,
    table: powerbi.DataViewTable,
    options: VisualUpdateOptions
  ) {
    //Tooltip
    let divTooltip = d3
      .select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("opacity", 0);

    this.container.html("");
    let width: number = options.viewport.width;
    let height: number = options.viewport.height;
    this.svg.attr("width", width);
    this.svg.attr("height", height);

    let fontSizeValue: number = Math.min(width, height) / 30;
    let counter = 1;

    violations.forEach((v) => {
      if (counter <= 19) {
        let violationString =
          Math.trunc((v.caseIds.length / table.rows.length) * 100) +
          "% of cases " +
          (v.violationType == ViolationType.Missing ? "is " : "") +
          v.violationType +
          " " +
          v.violationActivity;
        let specificationsString = this.makeSpecificationTooltip(
          v.specifications,
          v.caseIds.length
        );

        let textValue = this.container
          .append("text")
          .classed("textValue", true)
          .on("mouseover", function (d) {
            divTooltip.transition().duration(200).style("opacity", 1);
            divTooltip
              .html(violationString + "<br/>" + "<br/>" + specificationsString)
              .style("left", d3.event.pageX + "px")
              .style("top", d3.event.pageY - 28 + "px");
          })
          .on("mouseout", function (d) {
            divTooltip.transition().duration(500).style("opacity", 0);
          });

        let selectedRowCount = "Selected cases: " + table.rows.length;

        this.container
          .append("text")
          .classed("selectedRows", true)
          .text(selectedRowCount)
          .attr("x", 50)
          .attr("y", 25)
          .attr("dy", "0.50em")
          .style("font-size", fontSizeValue + "px");

        textValue
          .text(violationString)
          .attr("x", 50)
          .attr("y", (counter + 2) * fontSizeValue)
          .attr("dy", "0.50em")
          .style("font-size", fontSizeValue + "px");
      }
      counter++;
    });
    if (violations.size === 0) {
      let textValue = this.container.append("text").classed("textValue", true);

      textValue
        .text("No violations found")
        .attr("x", 50)
        .attr("y", fontSizeValue)
        .attr("dy", "0.50em")
        .style("font-size", fontSizeValue + "px");
    }
  }

  private makeSpecificationTooltip(
    specifications: Map<string, Specification>,
    amount: number
  ) {
    let specArray = [];
    let outputString = "";
    specifications.forEach((s) => {
      specArray.push([s.name, s.caseIds]);
    });
    specArray.slice(0, 10).forEach((s) => {
      outputString +=
        Math.trunc((s[1].length / amount) * 100) +
        "% (" +
        s[1].length +
        " out of " +
        amount +
        " cases from " +
        s[0] +
        ")" +
        "<br/>";
    });
    return outputString;
  }
}
