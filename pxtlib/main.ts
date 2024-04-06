//% color="#ff8000" weight=100
namespace hello {
    export function start_NOTEReq_extentions_Sprite_scaling_foodammount (num: number) {
        tiles.setCurrentTilemap(tilemap`level2`)
        spawn("char")
        for (let index = 0; index < num; index++) {
            spawn("food")
        }
    }
    export function playerandfoodoverlapspriteothersprite (mySprite: Sprite, mySprite2: Sprite) {
        spawn("food")
        spawn("food")
        sprites.destroy(mySprite2)
        scaling.scaleByPercent(mySprite, 10, ScaleDirection.Uniformly, ScaleAnchor.Middle)
    }
    export function spawn (item: string) {
        if (item == "char") {
            mySprite = sprites.create(img`
                . . . . 2 2 2 2 2 2 2 . . . . 
                . . 2 2 3 3 3 3 3 3 3 2 2 . . 
                . 2 3 3 2 2 2 2 2 2 2 2 2 2 . 
                . 2 3 2 2 2 2 2 2 2 2 2 2 2 . 
                2 3 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 3 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 3 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 3 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 3 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 3 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 3 2 2 2 2 2 2 2 2 2 2 2 2 2 
                . 2 2 2 2 2 2 2 2 2 2 2 2 2 . 
                . 2 2 2 2 2 2 2 2 2 2 2 2 2 . 
                . . 2 2 2 2 2 2 2 2 2 2 2 . . 
                . . . . 2 2 2 2 2 2 2 . . . . 
                `, SpriteKind.Player)
            tiles.placeOnRandomTile(mySprite, assets.tile`transparency16`)
            scene.cameraFollowSprite(mySprite)
            controller.moveSprite(mySprite)
        } else if (item == "food") {
            foood = sprites.create(img`
                . . . . 2 2 2 2 2 2 2 . . . . 
                . . 2 2 2 2 2 2 2 2 2 2 2 . . 
                . 2 2 2 2 2 2 2 2 2 2 2 2 2 . 
                . 2 2 2 2 2 2 2 2 2 2 2 2 2 . 
                2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 
                2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 
                . 2 2 2 2 2 2 2 2 2 2 2 2 2 . 
                . 2 2 2 2 2 2 2 2 2 2 2 2 2 . 
                . . 2 2 2 2 2 2 2 2 2 2 2 . . 
             . . . . 2 2 2 2 2 2 2 . . . . 
                `, SpriteKind.Food)
        tiles.placeOnRandomTile(foood, assets.tile`transparency16`)
        }
    }
    let foood: Sprite = null
    let mySprite: Sprite = null
}
