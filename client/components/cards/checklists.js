import Cards from '/models/cards';
import Boards from '/models/boards';

const subManager = new SubsManager();
const { calculateIndexData, capitalize } = Utils;

function initSorting(items) {
  items.sortable({
    tolerance: 'pointer',
    helper: 'clone',
    items: '.js-checklist-item:not(.placeholder)',
    connectWith: '.js-checklist-items',
    appendTo: 'parent',
    distance: 7,
    placeholder: 'checklist-item placeholder',
    scroll: true,
    start(evt, ui) {
      ui.placeholder.height(ui.helper.height());
      EscapeActions.clickExecute(evt.target, 'inlinedForm');
    },
    stop(evt, ui) {
      const parent = ui.item.parents('.js-checklist-items');
      const checklistId = Blaze.getData(parent.get(0)).checklist._id;
      let prevItem = ui.item.prev('.js-checklist-item').get(0);
      if (prevItem) {
        prevItem = Blaze.getData(prevItem).item;
      }
      let nextItem = ui.item.next('.js-checklist-item').get(0);
      if (nextItem) {
        nextItem = Blaze.getData(nextItem).item;
      }
      const nItems = 1;
      const sortIndex = calculateIndexData(prevItem, nextItem, nItems);
      const checklistDomElement = ui.item.get(0);
      const checklistData = Blaze.getData(checklistDomElement);
      const checklistItem = checklistData.item;

      items.sortable('cancel');

      checklistItem.move(checklistId, sortIndex.base);
    },
  });
}

BlazeComponent.extendComponent({
  onRendered() {
    const self = this;
    self.itemsDom = this.$('.js-checklist-items');
    initSorting(self.itemsDom);
    self.itemsDom.mousedown(function(evt) {
      evt.stopPropagation();
    });

    function userIsMember() {
      return Meteor.user() && Meteor.user().isBoardMember();
    }

    // Disable sorting if the current user is not a board member
    self.autorun(() => {
      const $itemsDom = $(self.itemsDom);
      if ($itemsDom.data('uiSortable') || $itemsDom.data('sortable')) {
        $(self.itemsDom).sortable('option', 'disabled', !userIsMember());
        if (Utils.isMiniScreenOrShowDesktopDragHandles()) {
          $(self.itemsDom).sortable({
            handle: 'span.fa.checklistitem-handle',
          });
        }
      }
    });
  },

  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly() &&
      !Meteor.user().isWorker()
    );
  },

  /** returns the finished percent of the checklist */
  finishedPercent() {
    const ret = this.data().checklist.finishedPercent();
    return ret;
  },
}).register('checklistDetail');

BlazeComponent.extendComponent({
  addChecklist(event) {
    event.preventDefault();
    const textarea = this.find('textarea.js-add-checklist-item');
    const title = textarea.value.trim();
    let cardId = this.currentData().cardId;
    const card = Cards.findOne(cardId);
    if (card.isLinked()) cardId = card.linkedId;

    if (title) {
      Checklists.insert({
        cardId,
        title,
        sort: card.checklists().count(),
      });
      this.closeAllInlinedForms();
      setTimeout(() => {
        this.$('.add-checklist-item')
          .last()
          .click();
      }, 100);
    }
  },
  addChecklistItem(event) {
    event.preventDefault();
    const textarea = this.find('textarea.js-add-checklist-item');
    const newlineBecomesNewChecklistItem = this.find('input#toggleNewlineBecomesNewChecklistItem');
    const title = textarea.value.trim();
    const checklist = this.currentData().checklist;

    if (title) {
      let checklistItems = [title];
      if (newlineBecomesNewChecklistItem.checked) {
        checklistItems = title.split('\n').map(_value => _value.trim());
      }
      for (let checklistItem of checklistItems) {
        ChecklistItems.insert({
          title: checklistItem,
          checklistId: checklist._id,
          cardId: checklist.cardId,
          sort: Utils.calculateIndexData(checklist.lastItem()).base,
        });
      }
    }
    // We keep the form opened, empty it.
    textarea.value = '';
    textarea.focus();
  },

  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly() &&
      !Meteor.user().isWorker()
    );
  },

  deleteItem() {
    const checklist = this.currentData().checklist;
    const item = this.currentData().item;
    if (checklist && item && item._id) {
      ChecklistItems.remove(item._id);
    }
  },

  editChecklist(event) {
    event.preventDefault();
    const textarea = this.find('textarea.js-edit-checklist-item');
    const title = textarea.value.trim();
    const checklist = this.currentData().checklist;
    checklist.setTitle(title);
  },

  editChecklistItem(event) {
    event.preventDefault();

    const textarea = this.find('textarea.js-edit-checklist-item');
    const title = textarea.value.trim();
    const item = this.currentData().item;
    item.setTitle(title);
  },

  pressKey(event) {
    //If user press enter key inside a form, submit it
    //Unless the user is also holding down the 'shift' key
    if (event.keyCode === 13 && !event.shiftKey) {
      event.preventDefault();
      const $form = $(event.currentTarget).closest('form');
      $form.find('button[type=submit]').click();
    }
  },

  focusChecklistItem(event) {
    // If a new checklist is created, pre-fill the title and select it.
    const checklist = this.currentData().checklist;
    if (!checklist) {
      const textarea = event.target;
      textarea.value = capitalize(TAPi18n.__('r-checklist'));
      textarea.select();
    }
  },

  /** closes all inlined forms (checklist and checklist-item input fields) */
  closeAllInlinedForms() {
    this.$('.js-close-inlined-form').click();
  },

  events() {
    const events = {
      'click #toggleHideCheckedItemsButton'() {
        Meteor.call('toggleHideCheckedItems');
      },
    };

    return [
      {
        ...events,
        'click .js-open-checklist-details-menu': Popup.open('checklistActions'),
        'submit .js-add-checklist': this.addChecklist,
        'submit .js-edit-checklist-title': this.editChecklist,
        'submit .js-add-checklist-item': this.addChecklistItem,
        'submit .js-edit-checklist-item': this.editChecklistItem,
        'click .js-convert-checklist-item-to-card': Popup.open('convertChecklistItemToCard'),
        'click .js-delete-checklist-item': this.deleteItem,
        'focus .js-add-checklist-item': this.focusChecklistItem,
        // add and delete checklist / checklist-item
        'click .js-open-inlined-form': this.closeAllInlinedForms,
        keydown: this.pressKey,
      },
    ];
  },
}).register('checklists');

BlazeComponent.extendComponent({
  onCreated() {
    subManager.subscribe('board', Session.get('currentBoard'), false);
    this.selectedBoardId = new ReactiveVar(Session.get('currentBoard'));
  },

  boards() {
    return Boards.find(
      {
        archived: false,
        'members.userId': Meteor.userId(),
        _id: { $ne: Meteor.user().getTemplatesBoardId() },
      },
      {
        sort: { sort: 1 /* boards default sorting */ },
      },
    );
  },

  swimlanes() {
    const board = Boards.findOne(this.selectedBoardId.get());
    return board.swimlanes();
  },

  aBoardLists() {
    const board = Boards.findOne(this.selectedBoardId.get());
    return board.lists();
  },

  events() {
    return [
      {
        'change .js-select-boards'(event) {
          this.selectedBoardId.set($(event.currentTarget).val());
          subManager.subscribe('board', this.selectedBoardId.get(), false);
        },
      },
    ];
  },
}).register('boardsSwimlanesAndLists');

Template.checklists.helpers({
  checklists() {
    const card = Cards.findOne(this.cardId);
    const ret = card.checklists();
    return ret;
  },
  hideCheckedItems() {
    const currentUser = Meteor.user();
    if (currentUser) return currentUser.hasHideCheckedItems();
    return false;
  },
});

BlazeComponent.extendComponent({
  onRendered() {
    autosize(this.$('textarea.js-add-checklist-item'));
  },
  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly() &&
      !Meteor.user().isWorker()
    );
  },
  events() {
    return [
      {
        'click a.fa.fa-copy'(event) {
          const $editor = this.$('textarea');
          const promise = Utils.copyTextToClipboard($editor[0].value);

          const $tooltip = this.$('.copied-tooltip');
          Utils.showCopied(promise, $tooltip);
        },
      }
    ];
  }
}).register('addChecklistItemForm');

BlazeComponent.extendComponent({
  events() {
    return [
      {
        'click .js-delete-checklist' : Popup.afterConfirm('checklistDelete', function () {
          Popup.back(2);
          const checklist = this.checklist;
          if (checklist && checklist._id) {
            Checklists.remove(checklist._id);
          }
        }),
        'click .js-move-checklist' : Popup.open('moveChecklist'),
      }
    ]
  }
}).register('checklistActionsPopup');

BlazeComponent.extendComponent({
  onRendered() {
    autosize(this.$('textarea.js-edit-checklist-item'));
  },
  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly() &&
      !Meteor.user().isWorker()
    );
  },
  events() {
    return [
      {
        'click a.fa.fa-copy'(event) {
          const $editor = this.$('textarea');
          const promise = Utils.copyTextToClipboard($editor[0].value);

          const $tooltip = this.$('.copied-tooltip');
          Utils.showCopied(promise, $tooltip);
        },
      }
    ];
  }
}).register('editChecklistItemForm');

Template.checklistItemDetail.helpers({
  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly() &&
      !Meteor.user().isWorker()
    );
  },
  hideCheckedItems() {
    const user = Meteor.user();
    if (user) return user.hasHideCheckedItems();
    return false;
  },
});

BlazeComponent.extendComponent({
  toggleItem() {
    const checklist = this.currentData().checklist;
    const item = this.currentData().item;
    if (checklist && item && item._id) {
      item.toggleItem();
    }
  },
  events() {
    return [
      {
        'click .js-checklist-item .check-box-container': this.toggleItem,
      },
    ];
  },
}).register('checklistItemDetail');

BlazeComponent.extendComponent({
  onCreated() {
    const boardId = Utils.getCurrentBoardId();
    subManager.subscribe('board', boardId, false);
    // subManager.subscribe('swimlane', swimlaneId, false);
    // subManager.subscribe('list', listId, false);
    // subManager.subscribe('card', cardId, false);
    this.selectedBoardId = new ReactiveVar(boardId);
    this.selectedSwimlaneId = new ReactiveVar('');
    this.selectedListId = new ReactiveVar('');
    this.selectedCardId = new ReactiveVar('');
    this.setMoveChecklistDialogOption(boardId);
  },

  /** set the last confirmed dialog field values
   * @param boardId the current board id
   */
  setMoveChecklistDialogOption(boardId) {
    this.moveChecklistDialogOption = {
      'boardId' : "",
      'swimlaneId' : "",
      'listId' : "",
      'cardId': "",
    }

    let currentOptions = Meteor.user().getMoveChecklistDialogOptions();
    if (currentOptions && boardId && currentOptions[boardId]) {
      this.moveChecklistDialogOption = currentOptions[boardId];
    }
    const board = Boards.findOne(boardId);
    try {
      const swimlaneId = board.swimlanes().fetch()[0]._id;
      this.selectedSwimlaneId.set(swimlaneId);
    } catch (e) {}

    try {
      const listId = board.lists().fetch()[0];
      this.selectedListId.set(listId);
    } catch (e) {}

    const cardId = Utils.getCurrentCardId();
    this.selectedCardId.set(cardId);
  },

  /** returns if the board id was the last confirmed one
   * @param boardId check this board id
   * @return if the board id was the last confirmed one
   */
  isMoveChecklistDialogOptionBoardId(boardId) {
    let ret = this.moveChecklistDialogOption.boardId == boardId;
    return ret;
  },

  /** returns if the swimlane id was the last confirmed one
   * @param swimlaneId check this swimlane id
   * @return if the swimlane id was the last confirmed one
   */
  isMoveChecklistDialogOptionSwimlaneId(swimlaneId) {
    let ret = this.moveChecklistDialogOption.swimlaneId == swimlaneId;
    return ret;
  },

  /** returns if the list id was the last confirmed one
   * @param listId check this list id
   * @return if the list id was the last confirmed one
   */
  isMoveChecklistDialogOptionListId(listId) {
    let ret = this.moveChecklistDialogOption.listId == listId;
    return ret;
  },

  /** returns if the card id was the last confirmed one
   * @param cardId check this card id
   * @return if the card id was the last confirmed one
   */
  isMoveChecklistDialogOptionCardId(cardId) {
    let ret = this.moveChecklistDialogOption.cardId == cardId;
    return ret;
  },

  boards() {
    return Boards.find(
      {
        archived: false,
        'members.userId': Meteor.userId(),
        _id: { $ne: Meteor.user().getTemplatesBoardId() },
      },
      {
        sort: { sort: 1 },
      },
    );
  },

  swimlanes() {
    const board = Boards.findOne(this.selectedBoardId.get());
    return board.swimlanes();
  },

  lists() {
    const board = Boards.findOne(this.selectedBoardId.get());
    return board.lists();
  },

  cards() {
    const list = Lists.findOne(this.selectedListId.get());
    const ret = list.cards(this.selectedSwimlaneId.get());
    return ret;
  },

  events() {
    return [
      {
        'click .js-done'() {
          const boardSelect = this.$('.js-select-boards')[0];
          const boardId = boardSelect.options[boardSelect.selectedIndex].value;

          const listSelect = this.$('.js-select-lists')[0];
          const listId = listSelect.options[listSelect.selectedIndex].value;

          const swimlaneSelect = this.$('.js-select-swimlanes')[0];
          const swimlaneId = swimlaneSelect.options[swimlaneSelect.selectedIndex].value;

          const cardSelect = this.$('.js-select-cards')[0];
          const cardId = cardSelect.options[cardSelect.selectedIndex].value;

          const options = {
            'boardId' : boardId,
            'swimlaneId' : swimlaneId,
            'listId' : listId,
            'cardId': cardId,
          }
          Meteor.user().setMoveChecklistDialogOption(boardId, options);
          this.data().checklist.move(cardId);
          Popup.back(2);
        },
        'change .js-select-boards'(event) {
          const boardId = $(event.currentTarget).val();
          subManager.subscribe('board', boardId, false);
          this.setMoveChecklistDialogOption(boardId);
          this.selectedBoardId.set(boardId);
        },
        'change .js-select-swimlanes'(event) {
          this.selectedSwimlaneId.set($(event.currentTarget).val());
        },
        'change .js-select-lists'(event) {
          this.selectedListId.set($(event.currentTarget).val());
        },
      },
    ];
  },
}).register('moveChecklistPopup');
