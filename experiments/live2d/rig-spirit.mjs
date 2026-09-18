import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const path=resolve(process.argv[2]||'tmp/live2d/autolive2d','src/cubism/official.ts');
let src=await readFile(path,'utf8');
if(!src.includes('private static void applySpiritRig')) {
src=src.replace('writeStage(progressPath, "build-texture-atlases");','applySpiritRig(modelSource);\n      writeStage(progressPath, "build-texture-atlases");');
const code=`
  // Trial rig for our seven generated spirit layers. All keyforms are exported by Cubism.
  private static void applySpiritRig(CModelSource model) throws Exception {
    for (var mesh : model.getAllArtMeshes()) {
      String name = mesh.getLocalName();
      boolean body = name.equals("Body"), eye = name.startsWith("Eye");
      String state = body ? "ParamBreath" : eye ? (name.startsWith("EyeL") ? "ParamEyeLOpen" : "ParamEyeROpen") : "ParamMouthOpenY";
      String[] ids = body ? new String[]{state} : new String[]{"ParamEyeBallX", "ParamEyeBallY", state};
      float[][] values = body ? new float[][]{{0f,1f}} : new float[][]{{-1f,0f,1f},{-1f,0f,1f},{0f,0.25f,1f}};
      List<Pair<com.live2d.type.CParameterGuid,float[]>> keys = new ArrayList<>();
      for(int i=0;i<ids.length;i++) keys.add(new Pair<>(model.getParameterSourceSet().get(new CParameterId(ids[i])).getGuid(), values[i]));
      CArtMeshForm base = (CArtMeshForm)mesh.getDefaultKeyForm().deepCopy(new com.live2d.core.a());
      mesh.getKeyforms().clear();
      List<com.live2d.type.CFormGuid> guids = new ArrayList<>();
      int total = body ? 2 : 27;
      for(int n=0;n<total;n++) {
        // Cubism grid uses the first parameter as the fastest changing dimension.
        float x=body?0:values[0][n%3], y=body?0:values[1][(n/3)%3], v=body?n:values[2][n/9];
        var form=(CArtMeshForm)base.deepCopy(new com.live2d.core.a());
        form.setGuid(new com.live2d.type.CFormGuid());form.setName(name+"_"+n);
        float[] pos=java.util.Arrays.copyOf(base.getPositions(),base.getPositions().length);
        float cx=body?512:eye?(name.startsWith("EyeL")?434:588):511,cy=body?535:eye?(name.startsWith("EyeL")?537:565):596,sx=1,sy=1,opacity=1;
        if(body){sx=sy=1+v*0.008f;}
        else if(eye){if(name.endsWith("Open")){sy=0.06f+0.94f*v;opacity=Math.min(1f,v*4f);}else{opacity=1f-Math.min(1f,v*4f);}}
        else if(name.equals("MouthOpen")){sy=0.5f+0.5f*v;opacity=v;}else{opacity=1-v;}
        for(int i=0;i<pos.length;i+=2){pos[i]=(pos[i]-cx)*sx+cx+x*(eye?12:6);pos[i+1]=(pos[i+1]-cy)*sy+cy-y*(eye?8:4);}
        form.setPositions(pos);form.setOpacity(opacity);mesh.getKeyforms().add(form);guids.add(form.getGuid());
      }
      var grid=new KeyformGridSource(mesh);
      grid.getClass().getMethod("import",CModelSource.class,List.class,List.class).invoke(grid,model,keys,guids);
      mesh.setKeyformGridSource(grid);
    }
    model.updateParamInstance(true);
  }
`;
src=src.replace('  private static void applyStrictBindings(',code+'\n  private static void applyStrictBindings(');
await writeFile(path,src);
}
