$(function(){
    /*照片信息数组*/
    var photo_info=[
        {
            url:'videos/scene0079_00.mp4',
            title:'',
            description:'',
            author:'',
            date:''
        },
        {
            url:'videos/scene0158_00.mp4',
            title:'',
            description:'',
            author:'',
            date:''
        },
        {
            url:'videos/scene0316_00.mp4',
            title:'',
            description:'',
            author:'',
            date:''
        },
        {
            url:'videos/scene0616_00.mp4',
            title:'',
            description:'',
            author:'',
            date:''
        },
        {
            url:'videos/scene0653_00.mp4',
            title:'',
            description:'',
            author:'',
            date:''
        }
    ]



    /*改变图片内容的函数*/
    function change_pop_content(i){
        $("#v-content").fadeOut(250);
        $("#v-content").fadeIn(250);
        setTimeout(function () { $("#v-content").attr("src",photo_info[i].url); }, 250);
        $("#v-content").attr("name",i);
    }

    /*点next按钮，改为下一张*/
    $("#btn-next").click(function(){
        var i = Number($("#v-content").attr("name"))+1;
        if (i==photo_info.length){
            i = 0;
        }
        change_pop_content(i);
    })

    /*点pre按钮，改为上一张*/
    $("#btn-pre").click(function(){
        var i = Number($("#v-content").attr("name"))-1;
        if (i==-1){
            i = photo_info.length-1;
        }
        change_pop_content(i);
    })


});