<template>
  <div class="tiptap-editor border border-gray-700 rounded-lg bg-gray-900">
    <!-- Toolbar -->
    <div
      v-if="editor"
      class="flex flex-wrap items-center gap-1 border-b border-gray-700 bg-gray-800 p-2"
    >
      <!-- Headings Dropdown -->
      <div class="relative" ref="headingDropdownRef">
        <button
          type="button"
          @click="showHeadingDropdown = !showHeadingDropdown"
          :class="[
            'flex items-center gap-1 rounded p-1.5 transition-colors',
            editor?.isActive('heading')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Heading"
        >
          <Heading class="h-4 w-4" />
          <span class="text-xs">{{ currentHeadingLabel }}</span>
          <ChevronDown class="h-3 w-3" />
        </button>

        <div
          v-if="showHeadingDropdown"
          class="absolute left-0 top-full z-50 mt-1 w-36 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-xl"
        >
          <button
            type="button"
            @click="setHeading(1)"
            :class="[
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-700',
              editor?.isActive('heading', { level: 1 }) ? 'text-cyan-400' : 'text-gray-300',
            ]"
          >
            <span class="text-lg font-bold">H1</span>
            <span class="text-sm">Heading 1</span>
          </button>
          <button
            type="button"
            @click="setHeading(2)"
            :class="[
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-700',
              editor?.isActive('heading', { level: 2 }) ? 'text-cyan-400' : 'text-gray-300',
            ]"
          >
            <span class="text-base font-bold">H2</span>
            <span class="text-sm">Heading 2</span>
          </button>
          <button
            type="button"
            @click="setHeading(3)"
            :class="[
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-700',
              editor?.isActive('heading', { level: 3 }) ? 'text-cyan-400' : 'text-gray-300',
            ]"
          >
            <span class="text-sm font-bold">H3</span>
            <span class="text-sm">Heading 3</span>
          </button>
          <div class="my-1 border-t border-gray-700" />
          <button
            type="button"
            @click="setParagraph"
            :class="[
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-700',
              !editor?.isActive('heading') ? 'text-cyan-400' : 'text-gray-300',
            ]"
          >
            <Pilcrow class="h-4 w-4" />
            <span class="text-sm">Paragraph</span>
          </button>
        </div>
      </div>

      <!-- Font Size Dropdown (desktop only) -->
      <div class="relative hidden lg:block" ref="fontSizeDropdownRef">
        <button
          type="button"
          @click="showFontSizeDropdown = !showFontSizeDropdown"
          class="flex items-center gap-1 rounded bg-gray-700 p-1.5 text-gray-300 transition-colors hover:bg-gray-600"
          title="Font Size"
        >
          <ALargeSmall class="h-4 w-4" />
          <span class="text-xs">{{ currentFontSizeLabel }}</span>
          <ChevronDown class="h-3 w-3" />
        </button>

        <div
          v-if="showFontSizeDropdown"
          class="absolute left-0 top-full z-50 mt-1 w-32 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-xl"
        >
          <button
            v-for="size in FONT_SIZES"
            :key="size.name"
            type="button"
            @click="setFontSize(size.value)"
            :class="[
              'flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-700',
              currentFontSize === size.value ? 'text-cyan-400' : 'text-gray-300',
            ]"
          >
            <span :style="{ fontSize: size.value || '1rem' }">{{ size.name }}</span>
            <span class="text-xs text-gray-500">{{ size.label }}</span>
          </button>
        </div>
      </div>

      <!-- Basic Formatting -->
      <div class="flex items-center gap-0.5 border-r border-gray-700 pr-2">
        <button
          type="button"
          @click="editor.chain().focus().toggleBold().run()"
          :class="[
            'rounded p-1.5 transition-colors',
            editor.isActive('bold')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Bold (Ctrl+B)"
        >
          <Bold class="h-4 w-4" />
        </button>

        <button
          type="button"
          @click="editor.chain().focus().toggleItalic().run()"
          :class="[
            'rounded p-1.5 transition-colors',
            editor.isActive('italic')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Italic (Ctrl+I)"
        >
          <Italic class="h-4 w-4" />
        </button>

        <!-- Underline/strike hidden on mobile -->
        <button
          type="button"
          @click="editor.chain().focus().toggleUnderline().run()"
          :class="[
            'hidden lg:block rounded p-1.5 transition-colors',
            editor.isActive('underline')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon class="h-4 w-4" />
        </button>

        <button
          type="button"
          @click="editor.chain().focus().toggleStrike().run()"
          :class="[
            'hidden lg:block rounded p-1.5 transition-colors',
            editor.isActive('strike')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Strikethrough"
        >
          <Strikethrough class="h-4 w-4" />
        </button>
      </div>

      <!-- Lists -->
      <div class="flex items-center gap-0.5 border-r border-gray-700 pr-2">
        <button
          type="button"
          @click="editor.chain().focus().toggleBulletList().run()"
          :class="[
            'rounded p-1.5 transition-colors',
            editor.isActive('bulletList')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Bullet List"
        >
          <List class="h-4 w-4" />
        </button>

        <button
          type="button"
          @click="editor.chain().focus().toggleOrderedList().run()"
          :class="[
            'rounded p-1.5 transition-colors',
            editor.isActive('orderedList')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Numbered List"
        >
          <ListOrdered class="h-4 w-4" />
        </button>
      </div>

      <!-- Code (desktop only) -->
      <div class="hidden lg:flex items-center gap-0.5 border-r border-gray-700 pr-2">
        <button
          type="button"
          @click="editor.chain().focus().toggleCode().run()"
          :class="[
            'rounded p-1.5 transition-colors',
            editor.isActive('code')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Inline Code"
        >
          <Code class="h-4 w-4" />
        </button>

        <button
          type="button"
          @click="editor.chain().focus().toggleCodeBlock().run()"
          :class="[
            'rounded p-1.5 transition-colors',
            editor.isActive('codeBlock')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Code Block"
        >
          <CodeSquare class="h-4 w-4" />
        </button>

        <button
          type="button"
          @click="editor.chain().focus().setHorizontalRule().run()"
          class="rounded p-1.5 transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
          title="Horizontal Rule"
        >
          <HorizontalRuleIcon class="h-4 w-4" />
        </button>
      </div>

      <!-- Link -->
      <div class="flex items-center gap-0.5 border-r border-gray-700 pr-2">
        <button
          type="button"
          @click="toggleLink"
          :class="[
            'rounded p-1.5 transition-colors',
            editor.isActive('link')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Insert Link"
        >
          <Link2 class="h-4 w-4" />
        </button>
      </div>

      <!-- Image Upload -->
      <div class="flex items-center gap-0.5 border-r border-gray-700 pr-2">
        <input
          ref="imageInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          class="hidden"
          @change="handleImageSelect"
        />
        <button
          type="button"
          @click="triggerImageUpload"
          :disabled="isUploadingImage"
          :class="[
            'rounded p-1.5 transition-colors',
            isUploadingImage
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          :title="isUploadingImage ? 'Uploading...' : 'Insert Image (max 350KB)'"
        >
          <Loader2 v-if="isUploadingImage" class="h-4 w-4 animate-spin" />
          <ImageIcon v-else class="h-4 w-4" />
        </button>
        <button
          type="button"
          @click="insertCarousel"
          class="hidden lg:block rounded p-1.5 transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
          title="Insert Image Carousel"
        >
          <GalleryHorizontalEnd class="h-4 w-4" />
        </button>
      </div>

      <!-- Image Alignment (only shown when image is selected) -->
      <div
        v-if="isImageSelected"
        class="flex items-center gap-0.5 border-r border-gray-700 pr-2"
      >
        <button
          type="button"
          @click="setImageAlignment('left')"
          :class="[
            'rounded p-1.5 transition-colors',
            currentImageAlignment === 'left'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Align Left (text wraps right)"
        >
          <AlignLeft class="h-4 w-4" />
        </button>
        <button
          type="button"
          @click="setImageAlignment('center')"
          :class="[
            'rounded p-1.5 transition-colors',
            currentImageAlignment === 'center'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Align Center"
        >
          <AlignCenter class="h-4 w-4" />
        </button>
        <button
          type="button"
          @click="setImageAlignment('right')"
          :class="[
            'rounded p-1.5 transition-colors',
            currentImageAlignment === 'right'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Align Right (text wraps left)"
        >
          <AlignRight class="h-4 w-4" />
        </button>
        <div class="w-px h-4 bg-gray-600 mx-1" />
        <button
          type="button"
          @click="toggleImageRounded"
          :class="[
            'rounded p-1.5 transition-colors',
            currentImageRounded
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Toggle Rounded Corners"
        >
          <Circle class="h-4 w-4" />
        </button>
      </div>

      <!-- Text Alignment (only shown when text is selected, not images) -->
      <div
        v-if="isTextSelected && !isImageSelected"
        class="flex items-center gap-0.5 border-r border-gray-700 pr-2"
      >
        <button
          type="button"
          @click="editor.chain().focus().setTextAlign('left').run()"
          :class="[
            'rounded p-1.5 transition-colors',
            currentTextAlignment === 'left'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Align Left"
        >
          <AlignLeft class="h-4 w-4" />
        </button>
        <button
          type="button"
          @click="editor.chain().focus().setTextAlign('center').run()"
          :class="[
            'rounded p-1.5 transition-colors',
            currentTextAlignment === 'center'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Align Center"
        >
          <AlignCenter class="h-4 w-4" />
        </button>
        <button
          type="button"
          @click="editor.chain().focus().setTextAlign('right').run()"
          :class="[
            'rounded p-1.5 transition-colors',
            currentTextAlignment === 'right'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Align Right"
        >
          <AlignRight class="h-4 w-4" />
        </button>
        <button
          type="button"
          @click="editor.chain().focus().setTextAlign('justify').run()"
          :class="[
            'rounded p-1.5 transition-colors',
            currentTextAlignment === 'justify'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Justify"
        >
          <AlignJustify class="h-4 w-4" />
        </button>
      </div>

      <!-- Table Dropdown (desktop only) -->
      <div class="relative hidden lg:block" ref="tableDropdownRef">
        <button
          type="button"
          @click="showTableDropdown = !showTableDropdown"
          :class="[
            'flex items-center gap-1 rounded p-1.5 transition-colors',
            editor?.isActive('table')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Table"
        >
          <Table2 class="h-4 w-4" />
          <span class="text-xs">Table</span>
          <ChevronDown class="h-3 w-3" />
        </button>

        <!-- Table Dropdown Menu -->
        <div
          v-if="showTableDropdown"
          class="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-xl"
        >
          <button
            type="button"
            @click="insertTable"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700"
          >
            <Plus class="h-4 w-4" />
            Insert 3x3 Table
          </button>

          <div class="my-1 border-t border-gray-700" />

          <button
            type="button"
            @click="addColumnBefore"
            :disabled="!editor?.can().addColumnBefore()"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:bg-gray-700"
          >
            Add Column Before
          </button>
          <button
            type="button"
            @click="addColumnAfter"
            :disabled="!editor?.can().addColumnAfter()"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:bg-gray-700"
          >
            Add Column After
          </button>
          <button
            type="button"
            @click="deleteTableColumn"
            :disabled="!editor?.can().deleteColumn()"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:bg-gray-700"
          >
            <Minus class="h-4 w-4" />
            Delete Column
          </button>

          <div class="my-1 border-t border-gray-700" />

          <button
            type="button"
            @click="addRowBefore"
            :disabled="!editor?.can().addRowBefore()"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:bg-gray-700"
          >
            Add Row Before
          </button>
          <button
            type="button"
            @click="addRowAfter"
            :disabled="!editor?.can().addRowAfter()"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:bg-gray-700"
          >
            Add Row After
          </button>
          <button
            type="button"
            @click="deleteTableRow"
            :disabled="!editor?.can().deleteRow()"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:bg-gray-700"
          >
            <Minus class="h-4 w-4" />
            Delete Row
          </button>

          <div class="my-1 border-t border-gray-700" />

          <button
            type="button"
            @click="toggleTableRounded"
            :disabled="!editor?.isActive('table')"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:bg-gray-700"
          >
            <Circle class="h-4 w-4" />
            {{ currentTableRounded ? 'Remove Rounded Corners' : 'Add Rounded Corners' }}
          </button>

          <div class="my-1 border-t border-gray-700" />

          <button
            type="button"
            @click="deleteTable"
            :disabled="!editor?.can().deleteTable()"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 class="h-4 w-4" />
            Delete Table
          </button>
        </div>
      </div>

      <!-- Columns Dropdown (desktop only) -->
      <div class="relative hidden lg:block" ref="columnsDropdownRef">
        <button
          type="button"
          @click="showColumnsDropdown = !showColumnsDropdown"
          :class="[
            'flex items-center gap-1 rounded p-1.5 transition-colors',
            editor?.isActive('columns')
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="Multi-Column Layout"
        >
          <Columns2 class="h-4 w-4" />
          <span class="text-xs">Columns</span>
          <ChevronDown class="h-3 w-3" />
        </button>

        <!-- Columns Dropdown Menu -->
        <div
          v-if="showColumnsDropdown"
          class="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-xl"
        >
          <button
            type="button"
            @click="insertColumns(2)"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700"
          >
            <Columns2 class="h-4 w-4" />
            2 Columns
          </button>
          <button
            type="button"
            @click="insertColumns(3)"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700"
          >
            <Columns2 class="h-4 w-4" />
            3 Columns
          </button>

          <div class="my-1 border-t border-gray-700" />

          <button
            type="button"
            @click="deleteColumns"
            :disabled="!editor?.isActive('columns')"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 class="h-4 w-4" />
            Remove Columns
          </button>
        </div>
      </div>

      <!-- Column Background Color (only shown when inside a column) -->
      <div
        v-if="isInColumn"
        class="relative"
        ref="columnBgDropdownRef"
      >
        <button
          type="button"
          @click="showColumnBgDropdown = !showColumnBgDropdown"
          class="flex items-center gap-1 rounded bg-cyan-700 p-1.5 text-white transition-colors hover:bg-cyan-600"
          title="Column Background Color"
        >
          <Paintbrush class="h-4 w-4" />
          <span class="text-xs">Background</span>
          <ChevronDown class="h-3 w-3" />
        </button>

        <!-- Column Background Dropdown -->
        <div
          v-if="showColumnBgDropdown"
          class="absolute left-0 top-full z-50 mt-1 w-36 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-xl"
        >
          <div class="grid grid-cols-4 gap-1">
            <button
              v-for="color in COLUMN_BG_COLORS"
              :key="color.name"
              type="button"
              @click="setColumnBgColor(color.value)"
              :class="[
                'w-7 h-7 rounded transition-all',
                color.class,
                currentColumnBgColor === color.value
                  ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-gray-800'
                  : 'hover:ring-1 hover:ring-gray-500',
              ]"
              :title="color.name"
            />
          </div>
        </div>
      </div>

      <!-- MUD Colors Dropdown (desktop only) -->
      <div class="relative hidden lg:block" ref="colorDropdownRef">
        <button
          type="button"
          @click="showColorDropdown = !showColorDropdown"
          class="flex items-center gap-1 rounded bg-gray-700 p-1.5 text-gray-300 transition-colors hover:bg-gray-600"
          title="MUD Colors"
        >
          <Palette class="h-4 w-4" />
          <span class="text-xs">MUD Colors</span>
          <ChevronDown class="h-3 w-3" />
        </button>

        <!-- Color Dropdown -->
        <div
          v-if="showColorDropdown"
          class="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-xl"
        >
          <div class="grid grid-cols-1 gap-1">
            <button
              v-for="color in MUD_COLORS"
              :key="color.code"
              type="button"
              @click="applyMudColor(color.code)"
              class="flex items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-gray-700"
            >
              <span :class="[color.class, 'font-semibold']">●</span>
              <span class="text-gray-300">{{ color.name }}</span>
              <span class="ml-auto font-mono text-xs text-gray-500">{{
                color.code
              }}</span>
            </button>
          </div>

          <!-- Remove Color -->
          <div class="mt-2 border-t border-gray-700 pt-2">
            <button
              type="button"
              @click="removeMudColor"
              class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-gray-400 transition-colors hover:bg-gray-700"
            >
              <X class="h-4 w-4" />
              <span>Remove Color</span>
            </button>
          </div>
        </div>
      </div>

      <!-- View Source Toggle (desktop only) -->
      <div class="hidden lg:flex items-center gap-0.5 border-l border-gray-700 pl-2">
        <button
          type="button"
          @click="viewMode = viewMode === 'editor' ? 'html' : 'editor'"
          :class="[
            'rounded p-1.5 transition-colors',
            viewMode === 'html'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="View HTML Source"
        >
          <FileCode class="h-4 w-4" />
        </button>

        <button
          type="button"
          @click="viewMode = viewMode === 'editor' ? 'ansi' : 'editor'"
          :class="[
            'rounded p-1.5 transition-colors',
            viewMode === 'ansi'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          title="View Raw ANSI (Database Format)"
        >
          <FileText class="h-4 w-4" />
        </button>
      </div>

      <!-- Widgets Dropdown (only shown when enableWidgets is true) -->
      <div v-if="enableWidgets" class="relative border-l border-gray-700 pl-2" ref="widgetDropdownRef">
        <button
          type="button"
          @click="showWidgetDropdown = !showWidgetDropdown"
          class="flex items-center gap-1 rounded bg-gray-700 p-1.5 text-gray-300 transition-colors hover:bg-gray-600"
          title="Insert Widget"
        >
          <LayoutGrid class="h-4 w-4" />
          <span class="text-xs">Widgets</span>
          <ChevronDown class="h-3 w-3" />
        </button>

        <!-- Widget Dropdown Menu -->
        <div
          v-if="showWidgetDropdown"
          class="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-xl"
        >
          <button
            type="button"
            @click="insertTopFragger"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700"
          >
            <Trophy class="h-4 w-4 text-yellow-500" />
            Top Fragger
          </button>
          <button
            type="button"
            @click="insertRecentPvP"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700"
          >
            <Swords class="h-4 w-4 text-red-500" />
            Recent PvP
          </button>
          <button
            type="button"
            @click="insertMapPreview"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700"
          >
            <Map class="h-4 w-4 text-cyan-500" />
            World Map
          </button>
        </div>
      </div>
    </div>

    <!-- Editor Content -->
    <div v-if="viewMode === 'editor'">
      <EditorContent
        :editor="editor"
        class="prose prose-invert max-w-none p-4"
        @copy="handleCopy"
      />
    </div>

    <!-- HTML Source View -->
    <div v-else-if="viewMode === 'html'" class="p-4">
      <textarea
        :value="editor?.getHTML()"
        @input="updateFromSource"
        class="w-full min-h-[200px] font-mono text-sm bg-gray-950 text-gray-300 border border-gray-700 rounded p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        spellcheck="false"
      />
    </div>

    <!-- ANSI Raw View -->
    <div v-else-if="viewMode === 'ansi'" class="p-4">
      <div class="mb-2 text-xs text-gray-400">
        Edit raw ANSI codes directly. Changes will update the visual editor.
      </div>
      <textarea
        :value="getRawAnsi()"
        @input="updateFromAnsi"
        class="w-full min-h-[200px] font-mono text-sm bg-gray-950 text-gray-300 border border-gray-700 rounded p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        spellcheck="false"
      />
    </div>

    <!-- Image Upload Error -->
    <div
      v-if="imageUploadError"
      class="border-t border-red-700 bg-red-900/50 px-4 py-2 text-xs text-red-400"
    >
      {{ imageUploadError }}
    </div>

    <!-- Character Count -->
    <div
      v-if="editor"
      class="flex items-center justify-between border-t border-gray-700 bg-gray-800 px-4 py-2 text-xs text-gray-400"
    >
      <span>{{ editor.storage.characterCount.characters() }} characters</span>
      <span v-if="maxLength">
        {{ editor.storage.characterCount.characters() }} / {{ maxLength }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import UnderlineExtension from '@tiptap/extension-underline'
import LinkExtension from '@tiptap/extension-link'
import { ForumImage, type ImageAlignment } from './ForumImageExtension'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontSize } from './FontSizeExtension'
import TextAlign from '@tiptap/extension-text-align'
import CharacterCount from '@tiptap/extension-character-count'
import { MudColor, MUD_COLORS } from './MudColorExtension'
import { BuilderMention } from '@/components/builder/MentionExtension'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Columns, Column } from './ColumnExtension'
import { Carousel } from './CarouselExtension'
import { TopFragger, RecentPvP, MapPreview } from './widgets'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Code,
  CodeSquare,
  Link2,
  Palette,
  ChevronDown,
  X,
  FileCode,
  FileText,
  ImageIcon,
  Loader2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table2,
  Columns2,
  Plus,
  Minus,
  Trash2,
  Paintbrush,
  Heading,
  Pilcrow,
  ALargeSmall,
  Minus as HorizontalRuleIcon,
  Circle,
  GalleryHorizontalEnd,
  LayoutGrid,
  Trophy,
  Swords,
  Map,
} from 'lucide-vue-next'
import { htmlToAnsi, ansiToHtmlWithStyles } from '@/utils/ansiParser'
import { forumApi } from '@/services/api'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    maxLength?: number
    editable?: boolean
    enableMentions?: boolean
    enableWidgets?: boolean
  }>(),
  {
    placeholder: 'Write something...',
    editable: true,
    enableMentions: false,
    enableWidgets: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// Color dropdown state
const showColorDropdown = ref(false)
const colorDropdownRef = ref<HTMLElement>()

// Table dropdown state
const showTableDropdown = ref(false)
const tableDropdownRef = ref<HTMLElement>()
const currentTableRounded = ref(false)

// Columns dropdown state
const showColumnsDropdown = ref(false)
const columnsDropdownRef = ref<HTMLElement>()

// Column background color picker state
const showColumnBgDropdown = ref(false)
const columnBgDropdownRef = ref<HTMLElement>()
const isInColumn = ref(false)
const currentColumnBgColor = ref<string | null>(null)

// Column background color presets
const COLUMN_BG_COLORS = [
  { name: 'None', value: null, class: 'bg-transparent border border-gray-600' },
  { name: 'Light', value: 'rgba(255,255,255,0.05)', class: 'bg-white/5' },
  { name: 'Dark', value: 'rgba(0,0,0,0.3)', class: 'bg-black/30' },
  { name: 'Blue', value: 'rgba(59,130,246,0.15)', class: 'bg-blue-500/15' },
  { name: 'Green', value: 'rgba(34,197,94,0.15)', class: 'bg-green-500/15' },
  { name: 'Yellow', value: 'rgba(234,179,8,0.15)', class: 'bg-yellow-500/15' },
  { name: 'Red', value: 'rgba(239,68,68,0.15)', class: 'bg-red-500/15' },
  { name: 'Purple', value: 'rgba(168,85,247,0.15)', class: 'bg-purple-500/15' },
]

// Heading dropdown state
const showHeadingDropdown = ref(false)
const headingDropdownRef = ref<HTMLElement>()

// Font size dropdown state
const showFontSizeDropdown = ref(false)
const fontSizeDropdownRef = ref<HTMLElement>()
const currentFontSize = ref<string | null>(null)

// Widget dropdown state (only used when enableWidgets is true)
const showWidgetDropdown = ref(false)
const widgetDropdownRef = ref<HTMLElement>()

// Font size presets
const FONT_SIZES = [
  { name: 'Tiny', value: '0.75rem', label: '12px' },
  { name: 'Small', value: '0.875rem', label: '14px' },
  { name: 'Normal', value: null, label: '16px' },
  { name: 'Large', value: '1.25rem', label: '20px' },
  { name: 'Huge', value: '1.5rem', label: '24px' },
]

// Computed label for current heading
const currentHeadingLabel = computed(() => {
  if (!editor.value) return 'Text'
  if (editor.value.isActive('heading', { level: 1 })) return 'H1'
  if (editor.value.isActive('heading', { level: 2 })) return 'H2'
  if (editor.value.isActive('heading', { level: 3 })) return 'H3'
  return 'Text'
})

// Computed label for current font size
const currentFontSizeLabel = computed(() => {
  const size = FONT_SIZES.find(s => s.value === currentFontSize.value)
  return size?.name || 'Size'
})

// View mode state: 'editor' | 'html' | 'ansi'
const viewMode = ref<'editor' | 'html' | 'ansi'>('editor')

// Image upload state
const imageInputRef = ref<HTMLInputElement>()
const isUploadingImage = ref(false)
const imageUploadError = ref<string | null>(null)

// Max image size: 350KB
const MAX_IMAGE_SIZE = 350 * 1024

// Check if image is currently selected
const isImageSelected = ref(false)
const currentImageAlignment = ref<ImageAlignment>('center')
const currentImageRounded = ref(false)

// Text alignment state (for paragraphs/headings)
const isTextSelected = ref(false)
const currentTextAlignment = ref<'left' | 'center' | 'right' | 'justify'>('left')

// Create lowlight instance for syntax highlighting
const lowlight = createLowlight(common)

// Build extensions list (conditionally include mentions)
const baseExtensions = [
  StarterKit.configure({
    codeBlock: false, // We're using CodeBlockLowlight instead
    link: false, // We're using LinkExtension instead
    underline: false, // We're using UnderlineExtension instead
    horizontalRule: false, // We're using custom HorizontalRule without input rules
  }),
  // Custom HorizontalRule without input rules (so --- doesn't auto-convert)
  HorizontalRule.extend({
    addInputRules() {
      return []
    },
  }),
  UnderlineExtension,
  LinkExtension.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'text-cyan-400 underline hover:text-cyan-300',
    },
  }),
  ForumImage.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: {
      class: 'forum-inline-image rounded my-2',
    },
  }),
  CodeBlockLowlight.configure({
    lowlight,
    HTMLAttributes: {
      class: 'bg-gray-950 rounded p-4 font-mono text-sm overflow-x-auto',
    },
  }),
  TextStyle,
  FontSize,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    alignments: ['left', 'center', 'right', 'justify'],
  }),
  MudColor,
  CharacterCount.configure({
    limit: props.maxLength,
  }),
  Table.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        rounded: {
          default: false,
          parseHTML: element => element.getAttribute('data-rounded') === 'true',
          renderHTML: attributes => {
            if (!attributes.rounded) return {}
            return { 'data-rounded': 'true' }
          },
        },
      }
    },
  }).configure({
    resizable: true,
    HTMLAttributes: {
      class: 'editor-table',
    },
  }),
  TableRow,
  TableCell.configure({
    HTMLAttributes: {
      class: 'editor-table-cell',
    },
  }),
  TableHeader.configure({
    HTMLAttributes: {
      class: 'editor-table-header',
    },
  }),
  Columns,
  Column,
  Carousel,
]

// Build final extensions list based on props
const extensions = computed(() => {
  const exts = [...baseExtensions]
  if (props.enableMentions) {
    exts.push(BuilderMention)
  }
  if (props.enableWidgets) {
    exts.push(TopFragger)
    exts.push(RecentPvP)
    exts.push(MapPreview)
  }
  return exts
})

// Initialize editor
const editor = useEditor({
  content: props.modelValue,
  editable: props.editable,
  extensions: extensions.value,
  editorProps: {
    attributes: {
      class:
        'min-h-[200px] focus:outline-none prose-headings:text-gray-200 prose-p:text-gray-300 prose-strong:text-gray-200 prose-code:text-cyan-400 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
    },
    handlePaste: (view, event) => {
      const items = event.clipboardData?.items
      if (!items) return false

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault()
          const file = item.getAsFile()
          if (file) {
            handlePastedImage(file)
          }
          return true
        }
      }
      return false
    },
    handleDrop: (view, event) => {
      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return false

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          event.preventDefault()
          handlePastedImage(file)
          return true
        }
      }
      return false
    },
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  },
  onSelectionUpdate: ({ editor }) => {
    // Check if an image is selected
    isImageSelected.value = editor.isActive('image')
    if (isImageSelected.value) {
      currentImageAlignment.value = editor.getAttributes('image').alignment || 'center'
      currentImageRounded.value = editor.getAttributes('image').rounded || false
    }

    // Check if text (paragraph/heading) is selected (not image)
    isTextSelected.value = !editor.isActive('image') &&
      (editor.isActive('paragraph') || editor.isActive('heading'))
    if (isTextSelected.value) {
      currentTextAlignment.value =
        editor.isActive({ textAlign: 'center' }) ? 'center' :
        editor.isActive({ textAlign: 'right' }) ? 'right' :
        editor.isActive({ textAlign: 'justify' }) ? 'justify' : 'left'
    }

    // Check if cursor is inside a column
    isInColumn.value = editor.isActive('column')
    if (isInColumn.value) {
      currentColumnBgColor.value = editor.getAttributes('column').backgroundColor || null
    }

    // Track table rounded state
    if (editor.isActive('table')) {
      currentTableRounded.value = editor.getAttributes('table').rounded || false
    }

    // Track current font size from textStyle mark
    const textStyleAttrs = editor.getAttributes('textStyle')
    currentFontSize.value = textStyleAttrs.fontSize || null
  },
})

// Watch for external changes to modelValue
watch(
  () => props.modelValue,
  (newValue) => {
    if (editor.value && editor.value.getHTML() !== newValue) {
      editor.value.commands.setContent(newValue)
    }
  }
)

// Watch editable prop
watch(
  () => props.editable,
  (newValue) => {
    if (editor.value) {
      editor.value.setEditable(newValue)
    }
  }
)

// Apply MUD color to selection
function applyMudColor(colorCode: string) {
  if (editor.value) {
    editor.value.chain().focus().setMudColor(colorCode).run()
    showColorDropdown.value = false
  }
}

// Remove MUD color from selection
function removeMudColor() {
  if (editor.value) {
    editor.value.chain().focus().unsetMudColor().run()
    showColorDropdown.value = false
  }
}

// Set heading level
function setHeading(level: 1 | 2 | 3) {
  if (editor.value) {
    editor.value.chain().focus().toggleHeading({ level }).run()
    showHeadingDropdown.value = false
  }
}

// Set paragraph (remove heading)
function setParagraph() {
  if (editor.value) {
    editor.value.chain().focus().setParagraph().run()
    showHeadingDropdown.value = false
  }
}

// Set font size
function setFontSize(size: string | null) {
  if (editor.value) {
    if (size) {
      editor.value.chain().focus().setFontSize(size).run()
    } else {
      editor.value.chain().focus().unsetFontSize().run()
    }
    currentFontSize.value = size
    showFontSizeDropdown.value = false
  }
}

// Set image alignment
function setImageAlignment(alignment: ImageAlignment) {
  if (editor.value) {
    editor.value.chain().focus().setImageAlignment(alignment).run()
    currentImageAlignment.value = alignment
  }
}

// Toggle image rounded corners
function toggleImageRounded() {
  if (editor.value) {
    editor.value.chain().focus().toggleImageRounded().run()
    currentImageRounded.value = !currentImageRounded.value
  }
}

// Insert carousel
function insertCarousel() {
  editor.value?.chain().focus().insertCarousel().run()
}

// Insert Top Fragger widget
function insertTopFragger() {
  editor.value?.chain().focus().insertTopFragger().run()
  showWidgetDropdown.value = false
}

// Insert Recent PvP widget
function insertRecentPvP() {
  editor.value?.chain().focus().insertRecentPvP().run()
  showWidgetDropdown.value = false
}

// Insert Map Preview widget
function insertMapPreview() {
  editor.value?.chain().focus().insertMapPreview().run()
  showWidgetDropdown.value = false
}

// Table functions
function insertTable() {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  showTableDropdown.value = false
}

function addColumnBefore() {
  editor.value?.chain().focus().addColumnBefore().run()
}

function addColumnAfter() {
  editor.value?.chain().focus().addColumnAfter().run()
}

function deleteTableColumn() {
  editor.value?.chain().focus().deleteColumn().run()
}

function addRowBefore() {
  editor.value?.chain().focus().addRowBefore().run()
}

function addRowAfter() {
  editor.value?.chain().focus().addRowAfter().run()
}

function deleteTableRow() {
  editor.value?.chain().focus().deleteRow().run()
}

function deleteTable() {
  editor.value?.chain().focus().deleteTable().run()
  showTableDropdown.value = false
}

function toggleTableRounded() {
  if (editor.value) {
    const currentRounded = editor.value.getAttributes('table').rounded || false
    editor.value.chain().focus().updateAttributes('table', { rounded: !currentRounded }).run()
    currentTableRounded.value = !currentRounded
  }
}

// Column layout functions
function insertColumns(count: number) {
  editor.value?.chain().focus().insertColumns(count).run()
  showColumnsDropdown.value = false
}

function deleteColumns() {
  editor.value?.chain().focus().deleteColumns().run()
  showColumnsDropdown.value = false
}

// Set column background color
function setColumnBgColor(color: string | null) {
  editor.value?.chain().focus().setColumnBackground(color).run()
  currentColumnBgColor.value = color
  showColumnBgDropdown.value = false
}

// Toggle link
function toggleLink() {
  if (!editor.value) return

  const previousUrl = editor.value.getAttributes('link').href
  const url = window.prompt('URL', previousUrl)

  // cancelled
  if (url === null) {
    return
  }

  // empty
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  // update link
  editor.value
    .chain()
    .focus()
    .extendMarkRange('link')
    .setLink({ href: url })
    .run()
}

// Trigger image file input
function triggerImageUpload() {
  imageInputRef.value?.click()
}

// Handle image file selection
async function handleImageSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // Clear the input so the same file can be selected again
  target.value = ''

  await uploadAndInsertImage(file)
}

// Handle pasted/dropped image
async function handlePastedImage(file: File) {
  await uploadAndInsertImage(file)
}

// Common image upload logic
async function uploadAndInsertImage(file: File) {
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    imageUploadError.value = 'Only JPG, PNG, WebP, and GIF images are allowed'
    setTimeout(() => { imageUploadError.value = null }, 3000)
    return
  }

  // Validate file size (350KB)
  if (file.size > MAX_IMAGE_SIZE) {
    imageUploadError.value = `Image must be under ${MAX_IMAGE_SIZE / 1024}KB`
    setTimeout(() => { imageUploadError.value = null }, 3000)
    return
  }

  imageUploadError.value = null
  isUploadingImage.value = true

  try {
    const result = await forumApi.uploadPostImage(file)

    // Insert the image into the editor
    if (editor.value && result.imageUrl) {
      editor.value
        .chain()
        .focus()
        .setImage({ src: result.imageUrl, alt: file.name })
        .run()
    }
  } catch (error: any) {
    imageUploadError.value = error.response?.data?.error || 'Failed to upload image'
    setTimeout(() => { imageUploadError.value = null }, 5000)
  } finally {
    isUploadingImage.value = false
  }
}

// Update editor content from HTML source
function updateFromSource(event: Event) {
  const target = event.target as HTMLTextAreaElement
  if (editor.value) {
    editor.value.commands.setContent(target.value)
  }
}

function updateFromAnsi(event: Event) {
  const target = event.target as HTMLTextAreaElement
  const ansiText = target.value
  // Convert ANSI to HTML and update editor
  const htmlContent = ansiToHtmlWithStyles(ansiText)
  if (editor.value) {
    editor.value.commands.setContent(htmlContent)
  }
}

// Convert HTML to MUD ANSI codes
function htmlToMudAnsi(html: string): string {
  // Create a temporary div to parse HTML
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Map Tailwind classes back to MUD color codes
  const colorClassToMudCode: Record<string, string> = {
    'text-red-500': '&+R',
    'text-green-500': '&+G',
    'text-blue-500': '&+B',
    'text-yellow-500': '&+Y',
    'text-purple-500': '&+M',
    'text-cyan-500': '&+C',
    'text-white': '&+W',
    'text-gray-400': '&+L',
    'text-red-400': '&+r',
    'text-green-400': '&+g',
    'text-blue-400': '&+b',
    'text-yellow-400': '&+y',
    'text-purple-400': '&+m',
    'text-cyan-400': '&+c',
    'text-gray-200': '&+w',
    'text-gray-500': '&+l',
  }

  function processNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      let result = ''
      let prefix = ''
      let suffix = ''

      // Check for MUD color
      const mudColor = element.getAttribute('data-mud-color')
      if (mudColor) {
        prefix = mudColor
        suffix = '&n'
      } else {
        // Check for Tailwind color classes
        for (const [className, code] of Object.entries(colorClassToMudCode)) {
          if (element.classList.contains(className)) {
            prefix = code
            suffix = '&n'
            break
          }
        }
      }

      // Process formatting
      if (element.tagName === 'STRONG' || element.tagName === 'B') {
        // Bold is already handled by color codes
      } else if (element.tagName === 'EM' || element.tagName === 'I') {
        // Italic - no direct MUD equivalent
      } else if (element.tagName === 'BR') {
        return '\n'
      } else if (element.tagName === 'P') {
        suffix = '\n' + suffix
      }

      // Process child nodes
      for (const child of Array.from(node.childNodes)) {
        result += processNode(child)
      }

      return prefix + result + suffix
    }

    return ''
  }

  return processNode(temp).replace(/&n&n/g, '&n').trim()
}

// Handle copy event to convert HTML to MUD ANSI
function handleCopy(event: ClipboardEvent) {
  if (!editor.value) return

  const { from, to } = editor.value.state.selection
  const selectedHtml = editor.value.state.doc.textBetween(from, to, '\n')

  // Get the actual HTML of the selection
  const tempDiv = document.createElement('div')
  const fragment = editor.value.state.selection.content().content

  // Convert ProseMirror fragment to HTML
  let html = ''

  // Use editor's getHTML for selected range
  fragment.forEach((node: any) => {
    tempDiv.innerHTML = ''

    // Get node HTML by using TipTap's JSON to HTML conversion
    const nodeJson = node.toJSON()
    html += nodeToHtml(nodeJson)
  })

  // Convert to MUD ANSI
  const mudAnsi = htmlToMudAnsi(html || selectedHtml)

  // Set clipboard data
  event.clipboardData?.setData('text/plain', mudAnsi)
  event.preventDefault()
}

// Simple node to HTML converter
function nodeToHtml(node: any): string {
  if (node.type === 'text') {
    let text = node.text || ''

    // Check for marks (formatting)
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'mudColor' && mark.attrs?.mudColor) {
          text = `<span data-mud-color="${mark.attrs.mudColor}">${text}</span>`
        } else if (mark.type === 'bold') {
          text = `<strong>${text}</strong>`
        } else if (mark.type === 'italic') {
          text = `<em>${text}</em>`
        }
      }
    }

    return text
  }

  if (node.type === 'paragraph') {
    const content = node.content?.map(nodeToHtml).join('') || ''
    return `<p>${content}</p>`
  }

  if (node.content) {
    return node.content.map(nodeToHtml).join('')
  }

  return ''
}

// Get raw ANSI representation of current content
function getRawAnsi(): string {
  if (!editor.value) return ''
  const html = editor.value.getHTML()
  return htmlToAnsi(html)
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  if (
    colorDropdownRef.value &&
    !colorDropdownRef.value.contains(event.target as Node)
  ) {
    showColorDropdown.value = false
  }
  if (
    tableDropdownRef.value &&
    !tableDropdownRef.value.contains(event.target as Node)
  ) {
    showTableDropdown.value = false
  }
  if (
    columnsDropdownRef.value &&
    !columnsDropdownRef.value.contains(event.target as Node)
  ) {
    showColumnsDropdown.value = false
  }
  if (
    columnBgDropdownRef.value &&
    !columnBgDropdownRef.value.contains(event.target as Node)
  ) {
    showColumnBgDropdown.value = false
  }
  if (
    headingDropdownRef.value &&
    !headingDropdownRef.value.contains(event.target as Node)
  ) {
    showHeadingDropdown.value = false
  }
  if (
    fontSizeDropdownRef.value &&
    !fontSizeDropdownRef.value.contains(event.target as Node)
  ) {
    showFontSizeDropdown.value = false
  }
  if (
    widgetDropdownRef.value &&
    !widgetDropdownRef.value.contains(event.target as Node)
  ) {
    showWidgetDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  editor.value?.destroy()
})
</script>

<style scoped>
/* TipTap Editor Styles - using :deep() to penetrate into EditorContent */
:deep(.tiptap) {
  color: rgb(209 213 219);
}

:deep(.tiptap p.is-editor-empty:first-child::before) {
  color: #6b7280;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

:deep(.tiptap ul),
:deep(.tiptap ol) {
  padding-left: 1.5rem;
  color: rgb(209 213 219);
}

:deep(.tiptap ul) {
  list-style-type: disc;
}

:deep(.tiptap ol) {
  list-style-type: decimal;
}

:deep(.tiptap code) {
  border-radius: 0.25rem;
  background-color: rgb(31 41 55);
  padding: 0.125rem 0.375rem;
  font-family: ui-monospace, monospace;
  font-size: 0.875rem;
  color: rgb(34 211 238);
}

:deep(.tiptap pre) {
  margin: 1rem 0;
  overflow-x: auto;
  border-radius: 0.25rem;
  background-color: rgb(3 7 18);
  padding: 1rem;
  font-family: ui-monospace, monospace;
  font-size: 0.875rem;
}

:deep(.tiptap pre code) {
  background-color: transparent;
  padding: 0;
  color: rgb(209 213 219);
}

:deep(.tiptap blockquote) {
  border-left: 4px solid rgb(55 65 81);
  padding-left: 1rem;
  font-style: italic;
  color: rgb(156 163 175);
}

:deep(.tiptap hr) {
  margin: 1rem 0;
  border-color: rgb(55 65 81);
}

:deep(.tiptap h1),
:deep(.tiptap h2),
:deep(.tiptap h3) {
  font-weight: bold;
  color: rgb(229 231 235);
}

:deep(.tiptap h1) {
  font-size: 1.5rem;
}

:deep(.tiptap h2) {
  font-size: 1.25rem;
}

:deep(.tiptap h3) {
  font-size: 1.125rem;
}

:deep(.tiptap a) {
  color: rgb(34 211 238);
  text-decoration: underline;
}

:deep(.tiptap a:hover) {
  color: rgb(103 232 249);
}

/* Image alignment */
:deep(.tiptap img) {
  max-width: 100%;
  height: auto;
}

:deep(.tiptap img[data-alignment="left"]) {
  float: left;
  margin-right: 1rem;
  margin-bottom: 0.5rem;
  max-width: 50%;
}

:deep(.tiptap img[data-alignment="right"]) {
  float: right;
  margin-left: 1rem;
  margin-bottom: 0.5rem;
  max-width: 50%;
}

:deep(.tiptap img[data-alignment="center"]) {
  display: block;
  margin-left: auto;
  margin-right: auto;
  float: none;
}

:deep(.tiptap img[data-rounded="true"]) {
  border-radius: 0.75rem;
}

/* Mention highlight styles */
:deep(.tiptap .mention-highlight) {
  color: rgb(34 211 238);
  background-color: rgba(34, 211, 238, 0.1);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

/* Table styles */
:deep(.tiptap table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
  table-layout: fixed;
}

:deep(.tiptap th),
:deep(.tiptap td) {
  border: 1px solid rgb(55 65 81);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
  min-width: 100px;
}

:deep(.tiptap th) {
  background-color: rgb(31 41 55);
  font-weight: 600;
  color: rgb(229 231 235);
}

:deep(.tiptap td) {
  background-color: rgb(17 24 39);
  color: rgb(209 213 219);
}

:deep(.tiptap tr:hover td) {
  background-color: rgb(31 41 55);
}

/* Table rounded corners */
:deep(.tiptap table[data-rounded="true"]) {
  border-radius: 0.5rem;
  overflow: hidden;
}

:deep(.tiptap table[data-rounded="true"] th:first-child) {
  border-top-left-radius: 0.5rem;
}

:deep(.tiptap table[data-rounded="true"] th:last-child) {
  border-top-right-radius: 0.5rem;
}

:deep(.tiptap table[data-rounded="true"] tr:last-child td:first-child) {
  border-bottom-left-radius: 0.5rem;
}

:deep(.tiptap table[data-rounded="true"] tr:last-child td:last-child) {
  border-bottom-right-radius: 0.5rem;
}

/* Table cell selection */
:deep(.tiptap .selectedCell:after) {
  z-index: 2;
  position: absolute;
  content: "";
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(34, 211, 238, 0.2);
  pointer-events: none;
}

:deep(.tiptap th.selectedCell),
:deep(.tiptap td.selectedCell) {
  position: relative;
}

/* Column layout styles */
:deep(.tiptap .columns) {
  display: grid;
  gap: 1rem;
  margin: 1rem 0;
  padding: 0.5rem;
  border: 2px dashed rgb(59 130 246);
  border-radius: 0.5rem;
  background-color: rgba(59, 130, 246, 0.05);
  position: relative;
  align-items: stretch;
}

:deep(.tiptap .columns::before) {
  content: attr(data-columns) '-Column Layout';
  position: absolute;
  top: -0.75rem;
  left: 0.75rem;
  padding: 0 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: rgb(59 130 246);
  background-color: rgb(17 24 39);
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

:deep(.tiptap .columns[data-columns="2"]) {
  grid-template-columns: 1fr 1fr;
}

:deep(.tiptap .columns[data-columns="3"]) {
  grid-template-columns: 1fr 1fr 1fr;
}

:deep(.tiptap .column) {
  padding: 0.75rem;
  border: 2px solid rgb(75 85 99);
  border-radius: 0.375rem;
  min-height: 80px;
  background-color: rgba(31, 41, 55, 0.5);
  position: relative;
  display: flex;
  flex-direction: column;
}

:deep(.tiptap .column::before) {
  content: 'Column';
  position: absolute;
  top: 0.25rem;
  right: 0.5rem;
  font-size: 0.6rem;
  font-weight: 500;
  color: rgb(107 114 128);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  pointer-events: none;
}

:deep(.tiptap .columns[data-columns="2"] .column:first-child::before) {
  content: 'Left Column';
}

:deep(.tiptap .columns[data-columns="2"] .column:last-child::before) {
  content: 'Right Column';
}

:deep(.tiptap .columns[data-columns="3"] .column:first-child::before) {
  content: 'Column 1';
}

:deep(.tiptap .columns[data-columns="3"] .column:nth-child(2)::before) {
  content: 'Column 2';
}

:deep(.tiptap .columns[data-columns="3"] .column:last-child::before) {
  content: 'Column 3';
}

:deep(.tiptap .column:focus-within) {
  border-color: rgb(34 211 238);
  background-color: rgba(34, 211, 238, 0.1);
}

:deep(.tiptap .column:focus-within::before) {
  color: rgb(34 211 238);
}

/* Widget in column should fill height */
:deep(.tiptap .column .widget-node-wrapper) {
  flex: 1;
  min-height: 0;
}

/* Responsive columns */
@media (max-width: 640px) {
  :deep(.tiptap .columns[data-columns="2"]),
  :deep(.tiptap .columns[data-columns="3"]) {
    grid-template-columns: 1fr;
  }
}
</style>
