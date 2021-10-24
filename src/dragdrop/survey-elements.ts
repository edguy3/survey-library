import { SurveyElement } from "../survey-element";
import { IElement } from "../base-interfaces";
import { JsonObject, Serializer } from "../jsonobject";
import { PageModel } from "../page";
import { DragDropCore } from "./core";

export class DragDropSurveyElements extends DragDropCore<any> {
  public static newGhostPage: PageModel = null;
  public static restrictDragQuestionBetweenPages: boolean = false;
  public static edgeHeight: number = 30;
  public static nestedPanelDepth: number = -1;
  public static ghostSurveyElementName =
    "sv-drag-drop-ghost-survey-element-name"; // before renaming use globa search (we have also css selectors)

  protected isEdge: boolean = false;
  protected prevIsEdge: any = null;
  protected ghostSurveyElement: IElement = null;

  protected get draggedElementType(): string {
    return "survey-element";
  }

  public startDragToolboxItem(
    event: PointerEvent,
    draggedElementJson: JsonObject
  ): void {
    const draggedElement = this.createElementFromJson(draggedElementJson);
    this.startDrag(event, draggedElement);
  }

  protected createElementFromJson(json: object): HTMLElement {
    const element: any = this.createNewElement(json);
    if (element["setSurveyImpl"]) {
      element["setSurveyImpl"](this.survey);
    } else {
      element["setData"](this.survey);
    }
    element.renderWidth = "100%";
    return element;
  }

  private createNewElement(json: any): IElement {
    var newElement = Serializer.createClass(json["type"]);
    new JsonObject().toObject(json, newElement);
    return newElement;
  }

  protected getShortcutText(draggedElement: any): string {
    return draggedElement["title"] || draggedElement["name"];
  }

  protected getDropTargetByDataAttributeValue(
    dataAttributeValue: string,
    dropTargetNode: HTMLElement,
    event: PointerEvent
  ): any {
    this.isEdge = this.calculateIsEdge(dropTargetNode, event.clientY);

    if (!dataAttributeValue) {
      // panel dynamic
      const nearestDropTargetElement = dropTargetNode.parentElement.closest<
        HTMLElement
      >(this.dropTargetDataAttributeName);
      dataAttributeValue = this.getDataAttributeValueByNode(nearestDropTargetElement);
    }

    if (!dataAttributeValue) {
      throw new Error("Can't find drop target survey element name");
    }

    if (dataAttributeValue === DragDropSurveyElements.ghostSurveyElementName) {
      return this.prevDropTarget;
    }

    // drop to new page
    if (dataAttributeValue === "newGhostPage") {
      return DragDropSurveyElements.newGhostPage;
    }

    // drop to page
    let page: any = this.survey.getPageByName(dataAttributeValue);
    if (page) {
      if (
        // TODO we can't drop on not empty page directly for now
        page.elements.length !== 0
      ) {
        const elements = page.elements;
        page = this.isBottom ? elements[elements.length - 1] : elements[0];
      }
      return page;
    }

    // drop to question or panel
    let dropTarget: any;
    let question;

    this.survey.pages.forEach((page: PageModel) => {
      question = page.getElementByName(dataAttributeValue);
      if (question) dropTarget = question;
    });

    // drop to paneldynamic
    if (dropTarget.getType() === "paneldynamic" && !this.isEdge) {
      dropTarget = (<any>dropTarget).template;
    }
    // drop to panel
    else if (dropTarget.isPanel) {
      const panelDragInfo = this.getPanelDragInfo(
        dropTargetNode,
        dropTarget,
        event
      );
      dropTarget = panelDragInfo.dropTarget;
      this.isEdge = panelDragInfo.isEdge;
    }
    // drop to question

    //question inside paneldymanic
    if (!dropTarget.page) {
      const nearestDropTargetElement = dropTargetNode.parentElement.closest<
        HTMLElement
      >("[data-sv-drop-target-page]");
      dataAttributeValue = nearestDropTargetElement.dataset.svDropTargetPage;
      let page: any = this.survey.getPageByName(dataAttributeValue);
      dropTarget.__page = page;
    }

    return dropTarget;
    // EO drop to question or panel
  }

  protected isDropTargetValid(dropTarget: SurveyElement, isBottom: boolean): boolean {
    if (!dropTarget) return false;
    if (this.dropTarget === this.draggedElement) return false;

    if (
      DragDropSurveyElements.restrictDragQuestionBetweenPages &&
      this.shouldRestricDragQuestionBetweenPages(dropTarget)
    ) {
      return false;
    }

    return true;
  }

  protected isDropTargetDoesntChanged(newIsBottom: boolean): boolean {
    if (this.dropTarget === this.ghostSurveyElement) return true;
    return (
      this.dropTarget === this.prevDropTarget && newIsBottom === this.isBottom
      /*&&this.isEdge === this.prevIsEdge*/
    );
  }

  private shouldRestricDragQuestionBetweenPages(dropTarget: any): boolean {
    const oldPage = (<any>this.draggedElement)["page"];
    const newPage = dropTarget.isPage ? dropTarget : dropTarget["page"];

    // if oldPage === null then it is drom the toolbox
    return oldPage && oldPage !== newPage;
  }

  private getPanelDragInfo(
    HTMLElement: HTMLElement,
    dropTarget: any,
    event: PointerEvent
  ) {
    let isEdge = this.isEdge;

    if (!isEdge && dropTarget.questions.length !== 0) {
      HTMLElement = this.findDeepestDropTargetChild(HTMLElement);
      dropTarget = this.getDropTargetByNode(HTMLElement, event);
    }

    return { dropTarget, isEdge };
  }

  protected findDeepestDropTargetChild(parent: HTMLElement): HTMLElement {
    const selector = this.dropTargetDataAttributeName;

    let result = parent;
    while (!!parent) {
      result = parent;
      parent = parent.querySelector(selector);
    }

    return <HTMLElement>result;
  }

  private calculateIsEdge(HTMLElement: HTMLElement, clientY: number) {
    const middle = this.calculateMiddleOfHTMLElement(HTMLElement);
    return Math.abs(clientY - middle) >= DragDropSurveyElements.edgeHeight;
  }

  private calculateIsRight(): boolean {
    var pageOrPanel = this.dropTarget.parent;
    var srcIndex = pageOrPanel.elements.indexOf(this.draggedElement);
    var destIndex = pageOrPanel.elements.indexOf(this.dropTarget);
    return srcIndex < destIndex;
  }

  protected afterDragOver(): void {
    this.prevIsEdge = this.isEdge;
    this.insertGhostElementIntoSurvey();
  }

  protected doStartDrag(): void {
    this.ghostSurveyElement = this.createGhostSurveyElement();
  }

  protected doBanDropHere = (): void => {
    this.removeGhostElementFromSurvey();
    this.isEdge = null;
  };

  protected doDrop = (): any => {
    if (this.dropTarget) {
      return this.insertRealElementIntoSurvey();
    }

    return null;
  };

  protected doClear = (): void => {
    this.removeGhostElementFromSurvey();
    this.isEdge = null;
    this.ghostSurveyElement = null;
  };

  protected insertGhostElementIntoSurvey(): boolean {
    this.removeGhostElementFromSurvey();

    let isTargetRowMultiple = this.calcTargetRowMultiple();

    this.ghostSurveyElement = this.createGhostSurveyElement(isTargetRowMultiple);

    this.ghostSurveyElement.name =
      DragDropSurveyElements.ghostSurveyElementName; // TODO why do we need setup it manually see createGhostSurveyElement method

    this.parentElement = this.dropTarget.isPage
      ? this.dropTarget
      : ((<any>this.dropTarget).page || (<any>this.dropTarget).__page);

    if (this.isDragOverInsideEmptyPanel()) {
      this.dropTarget.isDragOverMe = true;
      return;
    }

    this.parentElement.dragDropStart(
      this.draggedElement,
      this.ghostSurveyElement,
      DragDropSurveyElements.nestedPanelDepth
    );

    const result = this.parentElement.dragDropMoveTo(
      this.dropTarget,
      isTargetRowMultiple ? this.calculateIsRight() : this.isBottom,
      this.isEdge
    );

    return result;
  }

  private calcTargetRowMultiple() {
    let targetParent = this.dropTarget.isPage || this.dropTarget.isPanel ? this.dropTarget : this.dropTarget.parent;

    if (this.dropTarget.getType() === "paneldynamic") {
      targetParent = this.dropTarget.templateValue;
    }

    let targetRow: any;

    targetParent.rows.forEach((row: any) => {
      if (row.elements.indexOf(this.dropTarget) !== -1) {
        targetRow = row;
      }
    });

    if (this.isEdge) {
      this.dropTarget = targetParent;
      return false;
    }

    return targetRow && targetRow.elements.length > 1;
  }

  private isDragOverInsideEmptyPanel(): boolean {
    const isEmptyPanel = this.dropTarget.isPanel && this.dropTarget.questions.length === 0;
    const isDragOverInside = !this.isEdge;
    return isEmptyPanel && isDragOverInside;
  }

  protected removeGhostElementFromSurvey(): void {
    if (this.prevDropTarget) this.prevDropTarget.isDragOverMe = false;
    if (!!this.parentElement) this.parentElement.dragDropFinish(true);
  }

  private insertRealElementIntoSurvey() {
    this.removeGhostElementFromSurvey();

    const isTargetRowMultiple = this.calcTargetRowMultiple();

    // ghost new page
    if (this.dropTarget.isPage && (<any>this.dropTarget)["_isGhost"]) {
      (<any>this.dropTarget)["_addGhostPageViewModel"]();
    }
    // EO ghost new page

    // fake target element (need only for "startWithNewLine:false" feature)
    //TODO need for dragDrop helper in library
    const json = new JsonObject().toJsonObject(this.draggedElement);
    json["type"] = this.draggedElement.getType();
    const fakeTargetElement = this.createFakeTargetElement(
      this.draggedElement.name,
      json
    );
    // EO fake target element

    this.parentElement.dragDropStart(
      this.draggedElement,
      fakeTargetElement,
      DragDropSurveyElements.nestedPanelDepth
    );

    this.parentElement.dragDropMoveTo(
      this.dropTarget,
      isTargetRowMultiple ? this.calculateIsRight() : this.isBottom,
      this.isEdge
    );

    const newElement = this.parentElement.dragDropFinish();
    return newElement;
  }

  private createFakeTargetElement(elementName: string, json: any): any {
    if (!elementName || !json) return null;
    var targetElement = null;
    targetElement = Serializer.createClass(json["type"]);
    new JsonObject().toObject(json, targetElement);
    targetElement.name = elementName;
    if (targetElement["setSurveyImpl"]) {
      targetElement["setSurveyImpl"](this.survey);
    } else {
      targetElement["setData"](this.survey);
    }
    targetElement.renderWidth = "100%";
    return targetElement;
  }

  private createGhostSurveyElement(isMultipleRowDrag = false): any {
    let className = "sv-drag-drop-ghost";
    let minWidth = "300px";

    if (isMultipleRowDrag) {
      minWidth = "4px";
      className += " sv-drag-drop-ghost--vertical";
    }

    const json: any = {
      type: "html",
      minWidth,
      name: DragDropSurveyElements.ghostSurveyElementName,
      html: `<div class="${className}"></div>`,
    };

    const element = <any>this.createElementFromJson(json);
    element.startWithNewLine = !isMultipleRowDrag;

    if (isMultipleRowDrag) {
      element.maxWidth = "4px";
      element.renderWidth = "0px";
      element.paddingRight = "0px";
      element.paddingLeft = "0px";
    }

    return element;
  }
}
