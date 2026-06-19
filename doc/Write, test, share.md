# Write, test, share

Content providers are a type of extension used to add more sources to existing features in Seanime.

* Anime torrent providers
* Manga providers
* Online streaming providers
* Custom sources

## 1. Write and test

### Code the extension

* [Anime Torrent Provider](./Anime\ Torrent\ Provider.md)
* [Manga Provider](./Manga\ Provider.md)
* [Online Streaming Provider](./Online\ Streaming\ Provider.md)

### Test in the playground

1. Go to the `Extensions` page in Seanime.
2. Click on the `Playground` dropdown option.

<img src="https://i.postimg.cc/fyy9xGmG/Clean-Shot-2024-08-25-at-14-30-362x.webp" alt="Playground" data-size="original">

3. Select which type of extension you want to test and enter the code.

You will be able to select the **method (function)** you want to test. Different methods have different **simulation parameters** based on real in-app usage.<br>

[![image.avif](https://i.postimg.cc/g28T7VkD/image.avif)](https://postimg.cc/hX4sz7mz)

## 2. Create a manifest file

### Create the file

> [!WARNING]
> Make the ID unique in order to avoid conflicts.
>
> The name of the file should be the same as the ID.

**`my-original-extension-id.json`**:

```json
{
    "id": "my-original-extension-id",
    "name": "My Extension Name",
    "description": "My Extension Description",
    "manifestURI": "",
    "version": "1.0.0",
    "author": "Author Name",
    "type": "",
    "language": "",
    "lang": "",
    "payload": ""
}
```

* `id`: ID of your extension.
* `name`: The name of the extension.
* `description`: A short description of the extension.
* `manifestURI`: The URI where the manifest file is hosted. Used by Seanime to check for updates. This can be empty if you don’t plan on hosting and sharing your extension.
* `version`: The version of the extension. `x.x.x` (e.g. 0.1.0)
* `author`: The author of the extension.
* `type`: The type of extension. See below for the available types.
  * `anime-torrent-provider`, `manga-provider`, `onlinestream-provider` , `custom-source`
* `language`: The **programming language** of the extension.
  * Can be **`typescript`, or `javascript`**.
* `lang`: **ISO 639-1** language of the extension’s content (e.g. “en”, “fr” etc.).
  * Set it to **`multi`** if your extension supports multiple languages.
* `readme`: URL to documentation
* `notes`: Additional info

### Paste the payload

You have two options:

1. Paste the code of your extension in the `payload` field.
2. Paste a URL to the code of your extension in the `payloadURI` field and remove `payload` empty.

## 3. Share

If you want to share your extension with others, you can host the manifest file on GitHub and [share](https://seanime.rahim.app/community/extensions) the link to the file.

If you just want to use it for yourself, just place the JSON file in the `extensions` directory in your [data directory](https://seanime.rahim.app/docs/config#data-directory).

## 4. Update your extension

This is a simple process. Just update the `version` field in the JSON file and paste the new code in the `payload` field.

> [!WARNING]
> Your extension might become incompatible with a later version of Seanime.
> 
> Check the Extension Changelog for breaking changes and update your code accordingly.

<figure><img src="https://i.postimg.cc/RVzjPvNQ/Clean-Shot-2024-08-27-at-18-49-172x.webp" alt="" width="375"><figcaption></figcaption></figure>

> [!WARNING]
> Do not change your extension ID between updates

## Add user configuration (optional)

You can make it so users can enter arbitrary values that you can use in variables inside your code. This is useful when your extension needs to use a personal API key for example.

<details>

<summary>Guide</summary>

<img src="/files/LjKz3x2ZGcCqmB1Jhzzp" alt="" data-size="original">

* Declare any number of **string** variables containing the configuration field keys you want to accept in the format `{{key}}`. These variables will be replaced with the values the user entered when the extension is loaded.
* In your manifest file, add a `userConfig` field.

> [!NOTE]
> The field's 'name' should be the same as the key between the double curly brackets in your code.

```json
{
    //...
    "userConfig": {
        "requiresConfig": true,
        "version": 1,
        "fields": [
            {
                "name": "api",
                "label": "API URL",
                "type": "text",
                "default": "https://feed.animetosho.org/json"
            },
            {
                "name": "withSmartSearch",
                "label": "Enable Smart Search",
                "type": "switch",
                "default": "true"
            },
            {
                "name": "type",
                "label": "Provider Type",
                "type": "select",
                "default": "main",
                "options": [
                    {
                        "label": "Main",
                        "value": "main"
                    },
                    {
                        "label": "Special",
                        "value": "special"
                    }
                ]
            }
        ]
    }
}
```

* `requiresConfig`: Set to `true` to force the user to validate the configuration before the extension is loaded.
* `version`: The version of the configuration. Increment this number when you make changes to the configuration fields of your extension.

</details>